import { TelegramCommandService } from '../src/telegram/TelegramCommandService';
import { AttendanceExecutor } from '../src/executor';
import { IConfig, ILogger, IStorageService } from '../src/types';

describe('TelegramCommandService', () => {
  let mockConfig: IConfig;
  let mockLogger: ILogger;
  let mockStorage: jest.Mocked<IStorageService>;
  let mockExecutor: jest.Mocked<AttendanceExecutor>;
  let service: TelegramCommandService;
  let fetchSpy: jest.Mock;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    mockConfig = {
      HRONE_URL: 'https://company.hrone.cloud',
      USERNAME: 'user',
      PASSWORD: 'password',
      HEADLESS: true,
      TIMEZONE: 'Asia/Kolkata',
      SESSION_FILE_PATH: 'session.json',
      ADMIN_USERNAME: 'admin',
      ADMIN_PASSWORD: 'adminpassword',
      ADMIN_PORT: 3000,
      TELEGRAM_BOT_TOKEN: 'mock_token',
      TELEGRAM_CHAT_ID: '123456',
      ENABLE_NOTIFICATIONS: true,
    };

    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    };

    mockStorage = {
      isDateSkipped: jest.fn(),
      setDateSkip: jest.fn(),
      getLastRun: jest.fn(),
      setLastRun: jest.fn(),
      getTodayState: jest.fn(),
      setTodayState: jest.fn(),
      getTelegramMetadata: jest.fn(),
      setTelegramMetadata: jest.fn(),
      getHistory: jest.fn(),
      addHistoryEntry: jest.fn(),
    } as unknown as jest.Mocked<IStorageService>;

    mockExecutor = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<AttendanceExecutor>;

    service = new TelegramCommandService(mockConfig, mockLogger, mockStorage, mockExecutor);

    originalFetch = globalThis.fetch;
    fetchSpy = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        result: [],
      }),
    } as unknown as Response);
    globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('should skip polling if ENABLE_NOTIFICATIONS is false', async () => {
    mockConfig.ENABLE_NOTIFICATIONS = false;

    await service.pollForUpdates();

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('should fetch updates, ignore unauthorized chat IDs, and update metadata offset', async () => {
    mockStorage.getTelegramMetadata.mockResolvedValue({
      lastProcessedUpdateId: 100,
      lastSyncTime: 'N/A',
      botConnected: true,
      lastCommand: 'None',
      lastCommandTime: 'N/A',
    });

    fetchSpy.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        result: [
          {
            update_id: 101,
            message: {
              chat: { id: 99999 }, // Unauthorized Chat ID
              text: 'Leave',
              date: 1719878400,
            },
          },
        ],
      }),
    } as unknown as Response);

    await service.pollForUpdates();

    // Verify security warning is logged
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Unauthorized Telegram command attempt from Chat ID: "99999"'),
    );

    // Verify today's state was NOT updated
    expect(mockStorage.setTodayState).not.toHaveBeenCalled();

    // Verify lastProcessedUpdateId is incremented anyway to skip this update next time
    expect(mockStorage.setTelegramMetadata).toHaveBeenCalledWith({
      lastProcessedUpdateId: 101,
    });
  });

  it('should process authorized "Leave" command and disable today state', async () => {
    mockStorage.getTelegramMetadata.mockResolvedValue({
      lastProcessedUpdateId: 200,
      lastSyncTime: 'N/A',
      botConnected: true,
      lastCommand: 'None',
      lastCommandTime: 'N/A',
    });

    fetchSpy.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        result: [
          {
            update_id: 201,
            message: {
              chat: { id: 123456 }, // Authorized
              text: 'Leave',
              date: 1719878400,
            },
          },
        ],
      }),
    } as unknown as Response);

    await service.pollForUpdates();

    expect(mockStorage.setTodayState).toHaveBeenCalledWith(false, 'telegram');
    expect(mockStorage.addHistoryEntry).toHaveBeenCalledWith(
      'Leave',
      'Telegram',
      expect.any(Date),
      expect.any(Date),
    );

    // Verify it replied with confirmation
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('sendMessage'),
      expect.objectContaining({
        body: expect.stringContaining('Attendance has been disabled for today.'),
      }),
    );
  });

  it('should process authorized "Enable" command and activate today state', async () => {
    mockStorage.getTelegramMetadata.mockResolvedValue({
      lastProcessedUpdateId: 300,
      lastSyncTime: 'N/A',
      botConnected: true,
      lastCommand: 'None',
      lastCommandTime: 'N/A',
    });

    fetchSpy.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        result: [
          {
            update_id: 301,
            message: {
              chat: { id: 123456 },
              text: '/Enable', // case-insensitive, with slash
              date: 1719878400,
            },
          },
        ],
      }),
    } as unknown as Response);

    await service.pollForUpdates();

    expect(mockStorage.setTodayState).toHaveBeenCalledWith(true, 'telegram');
    expect(mockStorage.addHistoryEntry).toHaveBeenCalledWith(
      'Enable',
      'Telegram',
      expect.any(Date),
      expect.any(Date),
    );

    // Verify reply details
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('sendMessage'),
      expect.objectContaining({
        body: expect.stringContaining('Attendance has been enabled for today.'),
      }),
    );
  });

  it('should process authorized "Status" command and reply status details', async () => {
    mockStorage.getTelegramMetadata.mockResolvedValue({
      lastProcessedUpdateId: 400,
      lastSyncTime: 'N/A',
      botConnected: true,
      lastCommand: 'None',
      lastCommandTime: 'N/A',
    });

    mockStorage.getTodayState.mockResolvedValue({
      enabled: false,
      updatedBy: 'telegram',
      updatedAt: '2026-07-09T09:30:00Z',
    });

    mockStorage.getLastRun.mockResolvedValue({
      timestamp: '2026-07-09T09:00:00Z',
      status: 'Success',
      message: 'Marked successfully',
    });

    fetchSpy.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        result: [
          {
            update_id: 401,
            message: {
              chat: { id: 123456 },
              text: 'status',
              date: 1719878400,
            },
          },
        ],
      }),
    } as unknown as Response);

    await service.pollForUpdates();

    expect(mockStorage.addHistoryEntry).toHaveBeenCalledWith(
      'Status',
      'Telegram',
      expect.any(Date),
      expect.any(Date),
    );

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('sendMessage'),
      expect.objectContaining({
        body: expect.stringContaining('Status:\\nDisabled'),
      }),
    );
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('sendMessage'),
      expect.objectContaining({
        body: expect.stringContaining('Last Result:\\nSuccess (Marked successfully)'),
      }),
    );
  });

  it('should process authorized "Run" command, initiate manual execution, and reply success', async () => {
    mockStorage.getTelegramMetadata.mockResolvedValue({
      lastProcessedUpdateId: 500,
      lastSyncTime: 'N/A',
      botConnected: true,
      lastCommand: 'None',
      lastCommandTime: 'N/A',
    });

    fetchSpy.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        result: [
          {
            update_id: 501,
            message: {
              chat: { id: 123456 },
              text: 'run',
              date: 1719878400,
            },
          },
        ],
      }),
    } as unknown as Response);

    mockExecutor.execute.mockResolvedValue();

    await service.pollForUpdates();

    // Verify it triggers executor.execute(true) -> manual test settings override
    expect(mockExecutor.execute).toHaveBeenCalledWith(true);

    // Verify startup reply sent
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('sendMessage'),
      expect.objectContaining({
        body: expect.stringContaining('Starting Test Run...'),
      }),
    );

    // Verify success confirmation sent
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('sendMessage'),
      expect.objectContaining({
        body: expect.stringContaining('Attendance marked successfully.'),
      }),
    );
  });

  it('should process authorized "Run" command and reply failure details if execution throws', async () => {
    mockStorage.getTelegramMetadata.mockResolvedValue({
      lastProcessedUpdateId: 600,
      lastSyncTime: 'N/A',
      botConnected: true,
      lastCommand: 'None',
      lastCommandTime: 'N/A',
    });

    fetchSpy.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        result: [
          {
            update_id: 601,
            message: {
              chat: { id: 123456 },
              text: 'run',
              date: 1719878400,
            },
          },
        ],
      }),
    } as unknown as Response);

    mockExecutor.execute.mockRejectedValue(new Error('Browser connection crashed'));

    await service.pollForUpdates();

    expect(mockExecutor.execute).toHaveBeenCalledWith(true);

    // Verify failure details reply sent
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('sendMessage'),
      expect.objectContaining({
        body: expect.stringContaining('Attendance failed: Browser connection crashed'),
      }),
    );
  });

  it('should process authorized "Help" command and display manual text options', async () => {
    mockStorage.getTelegramMetadata.mockResolvedValue({
      lastProcessedUpdateId: 700,
      lastSyncTime: 'N/A',
      botConnected: true,
      lastCommand: 'None',
      lastCommandTime: 'N/A',
    });

    fetchSpy.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        result: [
          {
            update_id: 701,
            message: {
              chat: { id: 123456 },
              text: 'Help',
              date: 1719878400,
            },
          },
        ],
      }),
    } as unknown as Response);

    await service.pollForUpdates();

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('sendMessage'),
      expect.objectContaining({
        body: expect.stringContaining("Leave - Disable today's execution"),
      }),
    );
  });
});
