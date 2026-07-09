import {
  IBrowserService,
  ILoginService,
  IAttendanceService,
  IScreenshotService,
  IStorageService,
  INotificationService,
  ILogger,
  IConfig,
} from '../types';
import { PlaywrightBrowserService } from '../browser';
import { HROneLoginService } from '../login';
import { HROneAttendanceService } from '../attendance';
import { PlaywrightScreenshotService } from '../screenshot';
import { JsonStorageService } from '../storage';
import { TelegramNotificationService } from '../notifications';

export class AttendanceExecutor {
  private readonly browserService: IBrowserService;
  private readonly loginService: ILoginService;
  private readonly attendanceService: IAttendanceService;
  private readonly screenshotService: IScreenshotService;
  private readonly storageService: IStorageService;
  private readonly notificationService: INotificationService;

  constructor(
    config: IConfig,
    private readonly logger: ILogger,
    overrides?: {
      browserService?: IBrowserService;
      loginService?: ILoginService;
      attendanceService?: IAttendanceService;
      screenshotService?: IScreenshotService;
      storageService?: IStorageService;
      notificationService?: INotificationService;
    },
  ) {
    this.browserService = overrides?.browserService || new PlaywrightBrowserService(config, logger);
    this.loginService = overrides?.loginService || new HROneLoginService(config, logger);
    this.attendanceService =
      overrides?.attendanceService || new HROneAttendanceService(config, logger);
    this.screenshotService =
      overrides?.screenshotService || new PlaywrightScreenshotService(logger);
    this.storageService = overrides?.storageService || new JsonStorageService(logger);
    this.notificationService =
      overrides?.notificationService || new TelegramNotificationService(config, logger);
  }

  /**
   * Executes the full automated attendance workflow.
   * Both the scheduled cron runner and the admin panel test run execute through this method.
   * @param isManualTestRun If true, bypasses the today's date skip configuration check.
   */
  public async execute(isManualTestRun = false): Promise<void> {
    const todayStr = new Date().toISOString().split('T')[0];

    // 1. Check for Skip entry (only during scheduled cron executes)
    if (!isManualTestRun) {
      this.logger.info('Scheduler Started: Verifying if today is a scheduled execution day...');
      const isSkipped = await this.storageService.isDateSkipped(todayStr);
      if (isSkipped) {
        this.logger.warn(`Scheduler Skipped: Admin disabled run execution for date: ${todayStr}.`);
        this.logger.info("Attendance skipped because admin disabled today's execution.");
        await this.storageService.setLastRun(
          'Skipped',
          "Attendance skipped because admin disabled today's execution.",
        );
        try {
          await this.notificationService.sendSkipped('Disabled from Admin Dashboard.');
        } catch (err) {
          this.logger.error('Failed to send skip notification', err);
        }
        return;
      }
    } else {
      this.logger.info('Test Run Started: Manual override check active.');
    }

    let browserContext = null;
    let page = null;

    try {
      // 2. Launch Browser context
      browserContext = await this.browserService.launch();
      page = await this.browserService.getPage();

      // 3. Check Session / Login
      this.logger.info('Verifying session validity...');
      const sessionValid = await this.loginService.isSessionValid(page);
      if (!sessionValid) {
        this.logger.info('Session is invalid or expired. Initiating login...');
        await this.loginService.login(page);
        await this.browserService.saveState(browserContext);
      } else {
        this.logger.info('Valid session restored successfully.');
      }

      // 4. Mark Attendance
      const attendanceResult = await this.attendanceService.markAttendance(page);
      this.logger.info(`Attendance process results: ${attendanceResult.message}`);

      // 5. Capture Proof Screenshot
      let screenshotPath: string | undefined;
      try {
        screenshotPath = await this.screenshotService.capture(page);
      } catch (ssError) {
        this.logger.error('Failed to capture proof screenshot', ssError);
      }

      // 6. Record run details in storage
      const runStatus = attendanceResult.alreadyMarked ? 'Success (Already Marked)' : 'Success';
      await this.storageService.setLastRun(runStatus, attendanceResult.message);

      // 7. Dispatch Alert Notification
      try {
        if (isManualTestRun) {
          await this.notificationService.sendTestRun(screenshotPath);
        } else {
          await this.notificationService.sendSuccess(
            new Date(),
            attendanceResult.alreadyMarked,
            screenshotPath,
          );
        }
        this.logger.info('Attendance marked and notification sent.');
      } catch (notifyError) {
        this.logger.error('Failed to dispatch success notification', notifyError);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack || errorMsg : errorMsg;
      this.logger.error('AttendanceExecutor sequence encountered an exception', error);

      // Capture error screenshot if page is alive
      let errorScreenshotPath: string | undefined;
      if (page) {
        try {
          this.logger.info('Capturing error screenshot for debugging...');
          errorScreenshotPath = await this.screenshotService.capture(page);
        } catch (ssError) {
          this.logger.error('Failed to capture error screenshot', ssError);
        }
      }

      // Log failure state
      await this.storageService.setLastRun('Failed', errorMsg);

      // Dispatch failure message
      try {
        const cleanMsg = errorMsg.toLowerCase();
        const isExpectedFailure =
          cleanMsg.includes('login failed') ||
          cleanMsg.includes('button') ||
          cleanMsg.includes('modal') ||
          cleanMsg.includes('session') ||
          cleanMsg.includes('selector') ||
          cleanMsg.includes('timeout');

        if (isExpectedFailure) {
          await this.notificationService.sendFailure(errorMsg, new Date(), errorScreenshotPath);
        } else {
          await this.notificationService.sendUnexpectedError(
            errorStack,
            new Date(),
            errorScreenshotPath,
          );
        }
      } catch (notifyError) {
        this.logger.error('Failed to dispatch failure notification', notifyError);
      }

      throw error;
    } finally {
      // 8. Cleanup browser context
      if (browserContext) {
        try {
          await this.browserService.close();
        } catch (closeError) {
          this.logger.error('Error closing browser resources', closeError);
        }
      }
      this.logger.info(isManualTestRun ? 'Test Run Completed.' : 'Scheduler Completed.');
    }
  }
}
