import { Request, Response } from 'express';
import { IConfig, ILogger, IStorageService } from '../../types';
import { AttendanceExecutor } from '../../executor';

export class AdminController {
  constructor(
    private readonly config: IConfig,
    private readonly logger: ILogger,
    private readonly storageService: IStorageService,
    private readonly executor: AttendanceExecutor,
  ) {}

  /**
   * Renders the login screen.
   */
  public showLogin(req: Request, res: Response): void {
    if (req.session && req.session.isAuthenticated) {
      return res.redirect('/dashboard');
    }
    const errorMsg = req.query.error ? String(req.query.error) : null;
    res.render('login', { error: errorMsg });
  }

  /**
   * Validates admin portal credentials.
   */
  public handleLogin(req: Request, res: Response): void {
    const { username, password } = req.body;

    if (username === this.config.ADMIN_USERNAME && password === this.config.ADMIN_PASSWORD) {
      if (req.session) {
        req.session.isAuthenticated = true;
      }
      this.logger.info('Admin Login Success');
      res.redirect('/dashboard');
    } else {
      this.logger.warn(`Admin Login Failed: Unsuccessful login attempt for user: "${username}"`);
      res.redirect('/login?error=Invalid admin username or password');
    }
  }

  /**
   * Cleans session state and logs out.
   */
  public handleLogout(req: Request, res: Response): void {
    if (req.session) {
      req.session.destroy((err) => {
        if (err) {
          this.logger.error('Failed to destroy admin session', err);
        }
      });
    }
    res.redirect('/login');
  }

  /**
   * Prepares context variables and renders the control panel dashboard.
   */
  public async showDashboard(req: Request, res: Response): Promise<void> {
    const todayStr = new Date().toISOString().split('T')[0];
    const isSkipped = await this.storageService.isDateSkipped(todayStr);
    const lastRun = await this.storageService.getLastRun();

    const successMsg = req.query.success ? String(req.query.success) : null;
    const errorMsg = req.query.error ? String(req.query.error) : null;
    const nextScheduled = this.calculateNextRun();

    res.render('dashboard', {
      todayDate: new Date().toLocaleDateString('en-IN', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }),
      isBotEnabled: !isSkipped,
      lastRunTime: lastRun
        ? new Date(lastRun.timestamp).toLocaleString('en-IN', { timeZone: this.config.TIMEZONE })
        : 'Never Executed',
      lastRunStatus: lastRun ? lastRun.status : 'N/A',
      lastRunMessage: lastRun?.message || 'No runs registered yet.',
      nextScheduledRun: nextScheduled,
      successMessage: successMsg,
      errorMessage: errorMsg,
    });
  }

  /**
   * Disables bot execution for today.
   */
  public async stopToday(_req: Request, res: Response): Promise<void> {
    const todayStr = new Date().toISOString().split('T')[0];
    try {
      await this.storageService.setDateSkip(todayStr, true);
      this.logger.info("Today's Execution Disabled");
      res.redirect('/dashboard?success=Bot disabled for today. Scheduler will skip next run.');
    } catch (error) {
      this.logger.error(`Failed to disable run execution for today (${todayStr})`, error);
      res.redirect('/dashboard?error=Failed to disable bot execution.');
    }
  }

  /**
   * Re-enables bot execution for today.
   */
  public async enableToday(_req: Request, res: Response): Promise<void> {
    const todayStr = new Date().toISOString().split('T')[0];
    try {
      await this.storageService.setDateSkip(todayStr, false);
      this.logger.info("Today's Execution Enabled");
      res.redirect('/dashboard?success=Bot enabled for today. Scheduler will run normally.');
    } catch (error) {
      this.logger.error(`Failed to enable run execution for today (${todayStr})`, error);
      res.redirect('/dashboard?error=Failed to enable bot execution.');
    }
  }

  /**
   * Executes a manual visual test run.
   */
  public async triggerTestRun(_req: Request, res: Response): Promise<void> {
    this.logger.info('Test Run Started');
    try {
      // Execute the shared orchestrator using manual override settings
      await this.executor.execute(true);
      this.logger.info('Test Run Completed');
      res.redirect('/dashboard?success=Test run completed successfully!');
    } catch (error) {
      this.logger.error('Test run failed to execute successfully', error);
      const msg = error instanceof Error ? error.message : String(error);
      res.redirect(`/dashboard?error=Test run failed: ${msg}`);
    }
  }

  /**
   * Helper to calculate when the next weekday execution cron triggers.
   */
  private calculateNextRun(): string {
    const now = new Date();
    const target = new Date();
    target.setHours(10, 0, 0, 0);

    if (now.getTime() >= target.getTime()) {
      target.setDate(target.getDate() + 1);
    }

    // Skip weekends (6 = Sat, 0 = Sun)
    while (target.getDay() === 0 || target.getDay() === 6) {
      target.setDate(target.getDate() + 1);
    }

    return target.toLocaleString('en-IN', {
      timeZone: this.config.TIMEZONE,
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}
