import { TelegramCommandService } from '../src/telegram/TelegramCommandService';
import { IConfig, ILogger, IStorageService } from '../src/types';

describe('TelegramCommandService - Simplified Override Check', () => {
  let mockConfig: IConfig;
  let mockLogger: ILogger;
  let mockStorage: jest.Mocked<IStorageService>;
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

    service = new TelegramCommandService(mockConfig, mockLogger, mockStorage);

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

  it('should return null if ENABLE_NOTIFICATIONS is false', async () => {
    mockConfig.ENABLE_NOTIFICATIONS = false;

    const result = await service.checkForLeaveCommand();

    expect(result).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('should ignore updates from unauthorized chat IDs', async () => {
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
              text: '/leave',
              date: Math.floor(Date.now() / 1000), // Today
            },
          },
        ],
      }),
    } as unknown as Response);

    const result = await service.checkForLeaveCommand();

    expect(result).toBeNull();
    // Offset is still incremented to skip the message next time
    expect(mockStorage.setTelegramMetadata).toHaveBeenCalledWith({
      lastProcessedUpdateId: 101,
    });
  });

  it('should ignore other messages from the target chat ID', async () => {
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
              chat: { id: 123456 },
              text: 'hello bot',
              date: Math.floor(Date.now() / 1000),
            },
          },
        ],
      }),
    } as unknown as Response);

    const result = await service.checkForLeaveCommand();

    expect(result).toBeNull();
    expect(mockStorage.setTelegramMetadata).toHaveBeenCalledWith({
      lastProcessedUpdateId: 201,
    });
  });

  it('should return command details if an unprocessed /leave command was sent today from authorized chat ID', async () => {
    mockStorage.getTelegramMetadata.mockResolvedValue({
      lastProcessedUpdateId: 300,
      lastSyncTime: 'N/A',
      botConnected: true,
      lastCommand: 'None',
      lastCommandTime: 'N/A',
    });

    const nowSeconds = Math.floor(Date.now() / 1000);

    fetchSpy.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        result: [
          {
            update_id: 301,
            message: {
              chat: { id: 123456 },
              text: '/leave',
              date: nowSeconds,
            },
          },
        ],
      }),
    } as unknown as Response);

    const result = await service.checkForLeaveCommand();

    expect(result).not.toBeNull();
    expect(result?.receivedAt).toBeInstanceOf(Date);
    expect(result?.formattedTime).toMatch(/\d{2}:\d{2} [aApP][mM]/); // HH:MM AM/PM format
    expect(mockStorage.setTelegramMetadata).toHaveBeenCalledWith({
      lastProcessedUpdateId: 301,
    });
  });

  it('should return null if /leave command was sent on a previous day', async () => {
    mockStorage.getTelegramMetadata.mockResolvedValue({
      lastProcessedUpdateId: 400,
      lastSyncTime: 'N/A',
      botConnected: true,
      lastCommand: 'None',
      lastCommandTime: 'N/A',
    });

    // 2 days ago
    const twoDaysAgoSeconds = Math.floor((Date.now() - 2 * 24 * 60 * 60 * 1000) / 1000);

    fetchSpy.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        result: [
          {
            update_id: 401,
            message: {
              chat: { id: 123456 },
              text: '/leave',
              date: twoDaysAgoSeconds,
            },
          },
        ],
      }),
    } as unknown as Response);

    const result = await service.checkForLeaveCommand();

    expect(result).toBeNull();
    expect(mockStorage.setTelegramMetadata).toHaveBeenCalledWith({
      lastProcessedUpdateId: 401,
    });
  });
});
