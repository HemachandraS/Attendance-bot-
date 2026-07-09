import { JsonStorageService } from '../src/storage';
import { ILogger } from '../src/types';
import * as fs from 'fs';

jest.mock('fs');

describe('JsonStorageService', () => {
  let mockLogger: jest.Mocked<ILogger>;
  let mockFs: jest.Mocked<typeof fs>;

  beforeEach(() => {
    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    };
    mockFs = fs as unknown as jest.Mocked<typeof fs>;
    mockFs.existsSync.mockReset();
    mockFs.readFileSync.mockReset();
    mockFs.writeFileSync.mockReset();
    mockFs.mkdirSync.mockReset();
  });

  it('should return default skips and lastRun status if database does not exist', async () => {
    mockFs.existsSync.mockReturnValue(false);

    const storage = new JsonStorageService(mockLogger);
    const isSkipped = await storage.isDateSkipped('2026-07-08');
    const lastRun = await storage.getLastRun();

    expect(isSkipped).toBe(false);
    expect(lastRun).toBeNull();
  });

  it('should retrieve skip status if date skip is set to true', async () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue(
      JSON.stringify({
        skips: {
          '2026-07-08': { skip: true },
        },
        lastRun: null,
      }),
    );

    const storage = new JsonStorageService(mockLogger);
    const isSkipped = await storage.isDateSkipped('2026-07-08');

    expect(isSkipped).toBe(true);
  });

  it('should save date skip and write it to the filesystem', async () => {
    mockFs.existsSync.mockReturnValue(false);

    const storage = new JsonStorageService(mockLogger);
    await storage.setDateSkip('2026-07-08', true);

    expect(mockFs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('status.json'),
      expect.stringContaining('"2026-07-08": {\n      "skip": true\n    }'),
      'utf8',
    );
  });

  it('should remove date skip when set to false', async () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue(
      JSON.stringify({
        skips: {
          '2026-07-08': { skip: true },
        },
        lastRun: null,
      }),
    );

    const storage = new JsonStorageService(mockLogger);
    await storage.setDateSkip('2026-07-08', false);

    expect(mockFs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('status.json'),
      expect.stringContaining('"skips": {}'),
      'utf8',
    );
  });

  it('should write last run status details to filesystem', async () => {
    mockFs.existsSync.mockReturnValue(false);

    const storage = new JsonStorageService(mockLogger);
    await storage.setLastRun('Success', 'Marked successfully');

    expect(mockFs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('status.json'),
      expect.stringContaining('"status": "Success"'),
      'utf8',
    );
    expect(mockFs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('status.json'),
      expect.stringContaining('"message": "Marked successfully"'),
      'utf8',
    );
  });

  it('should manage TodayState configuration for the current date', async () => {
    mockFs.existsSync.mockReturnValue(false);
    const storage = new JsonStorageService(mockLogger);

    const todayStr = new Date().toISOString().split('T')[0];

    // Verify default active state
    const defaultState = await storage.getTodayState();
    expect(defaultState.enabled).toBe(true);

    // Disable execution for today
    await storage.setTodayState(false, 'telegram');

    expect(mockFs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('status.json'),
      expect.stringContaining('"enabled": false'),
      'utf8',
    );
    expect(mockFs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('status.json'),
      expect.stringContaining('"updatedBy": "telegram"'),
      'utf8',
    );

    // Verify today's status is read back correctly from the mock filesystem
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue(
      JSON.stringify({
        skips: {},
        lastRun: null,
        today: {
          enabled: false,
          updatedBy: 'telegram',
          updatedAt: new Date().toISOString(),
        },
      }),
    );

    const isSkipped = await storage.isDateSkipped(todayStr);
    expect(isSkipped).toBe(true);
  });

  it('should get and set Telegram metadata', async () => {
    mockFs.existsSync.mockReturnValue(false);
    const storage = new JsonStorageService(mockLogger);

    await storage.setTelegramMetadata({
      lastCommand: 'Leave',
      botConnected: true,
    });

    expect(mockFs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('status.json'),
      expect.stringContaining('"lastCommand": "Leave"'),
      'utf8',
    );

    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue(
      JSON.stringify({
        skips: {},
        lastRun: null,
        telegramMetadata: {
          lastProcessedUpdateId: 55,
          lastSyncTime: '2026-07-09T09:30:00Z',
          botConnected: true,
          lastCommand: 'Leave',
          lastCommandTime: '2026-07-09T09:30:00Z',
        },
      }),
    );

    const metadata = await storage.getTelegramMetadata();
    expect(metadata).not.toBeNull();
    expect(metadata?.lastProcessedUpdateId).toBe(55);
  });

  it('should maintain command execution logs in history', async () => {
    mockFs.existsSync.mockReturnValue(false);
    const storage = new JsonStorageService(mockLogger);

    const dateRec = new Date('2026-07-09T09:32:00Z');
    const dateProc = new Date('2026-07-09T09:32:05Z');

    await storage.addHistoryEntry('Leave', 'Telegram', dateRec, dateProc);

    expect(mockFs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('status.json'),
      expect.stringContaining('"action": "Leave"'),
      'utf8',
    );
    expect(mockFs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('status.json'),
      expect.stringContaining('"source": "Telegram"'),
      'utf8',
    );

    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue(
      JSON.stringify({
        skips: {},
        lastRun: null,
        history: [
          {
            action: 'Leave',
            source: 'Telegram',
            receivedAt: dateRec.toISOString(),
            processedAt: dateProc.toISOString(),
          },
        ],
      }),
    );

    const history = await storage.getHistory();
    expect(history.length).toBe(1);
    expect(history[0].action).toBe('Leave');
  });
});
