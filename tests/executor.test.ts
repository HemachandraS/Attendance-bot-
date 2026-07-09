import { BrowserContext, Page } from 'playwright';
import { AttendanceExecutor } from '../src/executor';
import {
  IBrowserService,
  ILoginService,
  IAttendanceService,
  IScreenshotService,
  IStorageService,
  INotificationService,
  ILogger,
  IConfig,
} from '../src/types';

describe('AttendanceExecutor', () => {
  let mockConfig: jest.Mocked<IConfig>;
  let mockLogger: jest.Mocked<ILogger>;
  let mockBrowserService: jest.Mocked<IBrowserService>;
  let mockLoginService: jest.Mocked<ILoginService>;
  let mockAttendanceService: jest.Mocked<IAttendanceService>;
  let mockScreenshotService: jest.Mocked<IScreenshotService>;
  let mockStorageService: jest.Mocked<IStorageService>;
  let mockNotificationService: jest.Mocked<INotificationService>;

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
      TELEGRAM_BOT_TOKEN: 'mock_bot_token',
      TELEGRAM_CHAT_ID: 'mock_chat_id',
      ENABLE_NOTIFICATIONS: true,
    };

    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    };

    mockBrowserService = {
      launch: jest.fn().mockResolvedValue({} as unknown as BrowserContext),
      close: jest.fn().mockResolvedValue(undefined),
      getPage: jest.fn().mockResolvedValue({} as unknown as Page),
      saveState: jest.fn().mockResolvedValue(undefined),
    };

    mockLoginService = {
      isSessionValid: jest.fn().mockResolvedValue(true),
      login: jest.fn().mockResolvedValue(true),
    };

    mockAttendanceService = {
      markAttendance: jest.fn().mockResolvedValue({
        success: true,
        alreadyMarked: false,
        message: 'Attendance marked',
        timestamp: new Date(),
      }),
    };

    mockScreenshotService = {
      capture: jest.fn().mockResolvedValue('screenshots/test.png'),
    };

    mockStorageService = {
      isDateSkipped: jest.fn().mockResolvedValue(false),
      setDateSkip: jest.fn().mockResolvedValue(undefined),
      getLastRun: jest.fn().mockResolvedValue(null),
      setLastRun: jest.fn().mockResolvedValue(undefined),
      getTodayState: jest
        .fn()
        .mockResolvedValue({ enabled: true, updatedBy: 'scheduler', updatedAt: '' }),
      setTodayState: jest.fn().mockResolvedValue(undefined),
      getTelegramMetadata: jest.fn().mockResolvedValue(null),
      setTelegramMetadata: jest.fn().mockResolvedValue(undefined),
      getHistory: jest.fn().mockResolvedValue([]),
      addHistoryEntry: jest.fn().mockResolvedValue(undefined),
    };

    mockNotificationService = {
      sendSuccess: jest.fn().mockResolvedValue(true),
      sendFailure: jest.fn().mockResolvedValue(true),
      sendSkipped: jest.fn().mockResolvedValue(true),
      sendTestRun: jest.fn().mockResolvedValue(true),
      sendUnexpectedError: jest.fn().mockResolvedValue(true),
      sendMessage: jest.fn().mockResolvedValue(true),
    };
  });

  it('should run successful marking attendance flow with valid session', async () => {
    const executor = new AttendanceExecutor(mockConfig, mockLogger, {
      browserService: mockBrowserService,
      loginService: mockLoginService,
      attendanceService: mockAttendanceService,
      screenshotService: mockScreenshotService,
      storageService: mockStorageService,
      notificationService: mockNotificationService,
    });

    await executor.execute(false);

    expect(mockStorageService.isDateSkipped).toHaveBeenCalled();
    expect(mockBrowserService.launch).toHaveBeenCalled();
    expect(mockLoginService.isSessionValid).toHaveBeenCalled();
    expect(mockLoginService.login).not.toHaveBeenCalled();
    expect(mockAttendanceService.markAttendance).toHaveBeenCalled();
    expect(mockScreenshotService.capture).toHaveBeenCalled();
    expect(mockStorageService.setLastRun).toHaveBeenCalledWith('Success', 'Attendance marked');
    expect(mockNotificationService.sendSuccess).toHaveBeenCalledWith(
      expect.any(Date),
      false,
      'screenshots/test.png',
    );
    expect(mockBrowserService.close).toHaveBeenCalled();
  });

  it('should execute login form sequence if restored session is invalid', async () => {
    mockLoginService.isSessionValid.mockResolvedValue(false);

    const executor = new AttendanceExecutor(mockConfig, mockLogger, {
      browserService: mockBrowserService,
      loginService: mockLoginService,
      attendanceService: mockAttendanceService,
      screenshotService: mockScreenshotService,
      storageService: mockStorageService,
      notificationService: mockNotificationService,
    });

    await executor.execute(false);

    expect(mockLoginService.isSessionValid).toHaveBeenCalled();
    expect(mockLoginService.login).toHaveBeenCalled();
    expect(mockBrowserService.saveState).toHaveBeenCalled();
    expect(mockAttendanceService.markAttendance).toHaveBeenCalled();
  });

  it('should exit immediately without browser launch if scheduler is disabled for today', async () => {
    mockStorageService.isDateSkipped.mockResolvedValue(true);

    const executor = new AttendanceExecutor(mockConfig, mockLogger, {
      browserService: mockBrowserService,
      loginService: mockLoginService,
      attendanceService: mockAttendanceService,
      screenshotService: mockScreenshotService,
      storageService: mockStorageService,
      notificationService: mockNotificationService,
    });

    await executor.execute(false);

    expect(mockStorageService.isDateSkipped).toHaveBeenCalled();
    expect(mockBrowserService.launch).not.toHaveBeenCalled();
    expect(mockAttendanceService.markAttendance).not.toHaveBeenCalled();
    expect(mockStorageService.setLastRun).toHaveBeenCalledWith(
      'Skipped',
      expect.stringContaining('admin disabled'),
    );
    expect(mockNotificationService.sendSkipped).toHaveBeenCalledWith(
      expect.stringContaining('Disabled from Admin Dashboard'),
    );
  });

  it('should bypass the skip execution check if run is manually triggered (isManualTestRun = true)', async () => {
    mockStorageService.isDateSkipped.mockResolvedValue(true);

    const executor = new AttendanceExecutor(mockConfig, mockLogger, {
      browserService: mockBrowserService,
      loginService: mockLoginService,
      attendanceService: mockAttendanceService,
      screenshotService: mockScreenshotService,
      storageService: mockStorageService,
      notificationService: mockNotificationService,
    });

    // Run as manual test run
    await executor.execute(true);

    expect(mockBrowserService.launch).toHaveBeenCalled();
    expect(mockAttendanceService.markAttendance).toHaveBeenCalled();
    expect(mockNotificationService.sendTestRun).toHaveBeenCalledWith('screenshots/test.png');
  });

  it('should capture screenshot, save failed run details, notify, and rethrow on automation failure', async () => {
    const error = new Error('Selector not found');
    mockAttendanceService.markAttendance.mockRejectedValue(error);

    const executor = new AttendanceExecutor(mockConfig, mockLogger, {
      browserService: mockBrowserService,
      loginService: mockLoginService,
      attendanceService: mockAttendanceService,
      screenshotService: mockScreenshotService,
      storageService: mockStorageService,
      notificationService: mockNotificationService,
    });

    await expect(executor.execute(false)).rejects.toThrow('Selector not found');

    expect(mockScreenshotService.capture).toHaveBeenCalled();
    expect(mockStorageService.setLastRun).toHaveBeenCalledWith('Failed', 'Selector not found');
    expect(mockNotificationService.sendFailure).toHaveBeenCalledWith(
      'Selector not found',
      expect.any(Date),
      'screenshots/test.png',
    );
    expect(mockBrowserService.close).toHaveBeenCalled();
  });
});
