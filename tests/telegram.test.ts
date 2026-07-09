import { TelegramNotificationService } from '../src/notifications/TelegramNotificationService';
import { IConfig, ILogger } from '../src/types';
import * as fs from 'fs';

jest.mock('fs');
jest.mock('../src/retry', () => ({
  retryOperation: jest.fn().mockImplementation(async (operation) => {
    return operation();
  }),
}));

describe('TelegramNotificationService', () => {
  let mockConfig: IConfig;
  let mockLogger: ILogger;
  let service: TelegramNotificationService;
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
      TELEGRAM_CHAT_ID: 'mock_chat_id',
      ENABLE_NOTIFICATIONS: true,
    };

    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    };

    service = new TelegramNotificationService(mockConfig, mockLogger);

    originalFetch = globalThis.fetch;
    fetchSpy = jest.fn().mockResolvedValue({
      ok: true,
      text: jest.fn().mockResolvedValue('ok'),
    } as unknown as Response);
    globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;

    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    jest.spyOn(fs, 'readFileSync').mockReturnValue(Buffer.from('mock_image_binary'));
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('should skip sending notifications if ENABLE_NOTIFICATIONS is false', async () => {
    mockConfig.ENABLE_NOTIFICATIONS = false;

    const result = await service.sendSuccess(new Date(), false);

    expect(result).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('should successfully send a text-only success notification', async () => {
    const result = await service.sendSuccess(new Date(), false);

    expect(result).toBe(true);
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('sendMessage'),
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: expect.stringContaining('Attendance marked successfully'),
      }),
    );
  });

  it('should successfully send already marked notification', async () => {
    const result = await service.sendSuccess(new Date(), true);

    expect(result).toBe(true);
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('sendMessage'),
      expect.objectContaining({
        body: expect.stringContaining('already marked'),
      }),
    );
  });

  it('should successfully send failure notification', async () => {
    const result = await service.sendFailure('Invalid credentials', new Date());

    expect(result).toBe(true);
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('sendMessage'),
      expect.objectContaining({
        body: expect.stringContaining('HR One Attendance Failed'),
      }),
    );
  });

  it('should send skipped notification', async () => {
    const result = await service.sendSkipped('Disabled from Admin Dashboard.');

    expect(result).toBe(true);
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('sendMessage'),
      expect.objectContaining({
        body: expect.stringContaining('skipped'),
      }),
    );
  });

  it('should send unexpected error notification with trace', async () => {
    const result = await service.sendUnexpectedError('Error: Crash at main', new Date());

    expect(result).toBe(true);
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('sendMessage'),
      expect.objectContaining({
        body: expect.stringContaining('Unexpected Error'),
      }),
    );
  });

  it('should send photo and text when screenshotPath exists', async () => {
    const result = await service.sendSuccess(new Date(), false, 'screenshots/test.png');

    expect(result).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    const calls = fetchSpy.mock.calls;
    const photoCall = calls.find((call) => call[0].includes('sendPhoto'));
    const messageCall = calls.find((call) => call[0].includes('sendMessage'));

    expect(photoCall).toBeDefined();
    expect(messageCall).toBeDefined();
  });

  it('should catch API errors and return false without failing execution', async () => {
    fetchSpy.mockRejectedValue(new Error('Network error'));

    const result = await service.sendMessage('test message');

    expect(result).toBe(false);
    expect(mockLogger.error).toHaveBeenCalledWith('Telegram API Error', expect.any(Error));
  });
});
