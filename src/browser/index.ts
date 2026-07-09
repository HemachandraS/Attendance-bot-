import * as fs from 'fs';
import { Browser, BrowserContext, Page, chromium } from 'playwright';
import { IBrowserService, IConfig, ILogger } from '../types';
import { BrowserLaunchError } from '../utils/errors';
import { retryOperation } from '../retry';

export class PlaywrightBrowserService implements IBrowserService {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;

  constructor(
    private readonly config: IConfig,
    private readonly logger: ILogger,
  ) {}

  public async launch(): Promise<BrowserContext> {
    try {
      this.logger.info('Launching Browser...');

      // Launch chromium browser with retry
      this.browser = await retryOperation(
        async () => {
          return await chromium.launch({
            headless: this.config.HEADLESS,
            args: [
              '--disable-dev-shm-usage',
              '--no-sandbox',
              '--disable-setuid-sandbox',
              '--disable-blink-features=AutomationControlled',
            ],
          });
        },
        this.logger,
        'BrowserLaunch',
      );

      this.logger.info('Browser Started.');

      const options: Parameters<Browser['newContext']>[0] = {
        viewport: { width: 1280, height: 800 },
        userAgent:
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        timezoneId: this.config.TIMEZONE,
      };

      // Check if session file exists
      if (fs.existsSync(this.config.SESSION_FILE_PATH)) {
        this.logger.info(`Restoring session from: ${this.config.SESSION_FILE_PATH}`);
        options.storageState = this.config.SESSION_FILE_PATH;
      } else {
        this.logger.info('No existing session found. Starting fresh session.');
      }

      this.context = await this.browser.newContext(options);
      return this.context;
    } catch (error) {
      const launchErr = new BrowserLaunchError(
        'Failed to launch browser or create context',
        error as Error,
      );
      this.logger.error('Launch sequence failed', launchErr);
      throw launchErr;
    }
  }

  public async getPage(): Promise<Page> {
    if (!this.context) {
      throw new BrowserLaunchError('Browser context has not been launched. Call launch() first.');
    }
    if (this.page) {
      return this.page;
    }
    this.page = await this.context.newPage();
    return this.page;
  }

  public async saveState(context: BrowserContext): Promise<void> {
    try {
      this.logger.info(`Saving session state to: ${this.config.SESSION_FILE_PATH}`);
      await context.storageState({ path: this.config.SESSION_FILE_PATH });
      this.logger.info('Session state saved successfully.');
    } catch (error) {
      this.logger.error('Failed to save session state', error);
    }
  }

  public async close(): Promise<void> {
    try {
      this.logger.info('Closing browser and contexts...');
      if (this.page) {
        await this.page.close().catch(() => {});
        this.page = null;
      }
      if (this.context) {
        await this.context.close().catch(() => {});
        this.context = null;
      }
      if (this.browser) {
        await this.browser.close().catch(() => {});
        this.browser = null;
      }
      this.logger.info('Browser context closed safely.');
    } catch (error) {
      this.logger.error('Error occurred while closing browser', error);
    }
  }
}
