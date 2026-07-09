import { Page } from 'playwright';
import { IConfig, ILogger, ILoginService } from '../types';
import { LoginFailedError } from '../utils/errors';
import { retryOperation } from '../retry';

export class HROneLoginService implements ILoginService {
  constructor(
    private readonly config: IConfig,
    private readonly logger: ILogger,
  ) {}

  /**
   * Checks if the restored session is still valid.
   */
  public async isSessionValid(page: Page): Promise<boolean> {
    try {
      this.logger.info(`Checking session validity by navigating to: ${this.config.HRONE_URL}`);

      // Navigate to the HR One landing page
      await page.goto(this.config.HRONE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });

      // Give it a brief moment to redirect if needed
      await page.waitForTimeout(3000);

      const currentUrl = page.url();
      this.logger.debug(`Current URL during session check: ${currentUrl}`);

      // If the URL contains "login" or similar, or we see login inputs, the session is invalid
      if (currentUrl.includes('/login') || currentUrl.includes('/signin')) {
        this.logger.warn('Session invalid: Redirected to login page.');
        return false;
      }

      // Check for login input elements that shouldn't exist if logged in
      const loginInputExists = await page.evaluate(() => {
        const usernameInput = document.querySelector(
          'input[type="email"], input[name="username"], input[type="text"]',
        );
        const passwordInput = document.querySelector('input[type="password"]');
        return !!(usernameInput && passwordInput);
      });

      if (loginInputExists) {
        this.logger.warn('Session invalid: Login form inputs detected on page.');
        return false;
      }

      // Check if we can find typical logged-in markers
      // HR One dashboard elements: presence of dashboard widgets, log-out button, profile avatar, etc.
      const loggedInMarker = await page.evaluate(() => {
        const dashboardElements = [
          '.dashboard',
          '#dashboard',
          '[class*="dashboard"]',
          '[class*="profile"]',
          '[class*="header"]',
          'text="Dashboard"',
          'a[href*="logout"]',
          'button[class*="avatar"]',
        ];
        return dashboardElements.some((selector) => !!document.querySelector(selector));
      });

      if (loggedInMarker) {
        this.logger.info('Session is valid. Logged-in workspace detected.');
        return true;
      }

      // Fallback: If we didn't explicitly see login forms but also didn't confirm dashboard markers
      this.logger.warn('Session status uncertain. Treating as invalid to force login check.');
      return false;
    } catch (error) {
      this.logger.error('Error checking session validity', error);
      return false;
    }
  }

  /**
   * Performs the login sequence on the HR One login form.
   */
  public async login(page: Page): Promise<boolean> {
    this.logger.info('Starting login sequence...');

    try {
      // 1. Navigate to the login page (in case we aren't already there)
      await retryOperation(
        async () => {
          await page.goto(this.config.HRONE_URL, { waitUntil: 'networkidle', timeout: 30000 });
        },
        this.logger,
        'NavigateToLoginPage',
      );

      // 2. Identify username/email input using robust selectors
      const usernameSelector = await retryOperation(
        async () => {
          const selectors = [
            'input[name="username"]',
            'input[name="email"]',
            'input[type="email"]',
            'input[placeholder*="Username" i]',
            'input[placeholder*="Email" i]',
            'input[placeholder*="Login ID" i]',
            'input[type="text"]',
          ];

          for (const sel of selectors) {
            if (await page.locator(sel).isVisible()) {
              return sel;
            }
          }
          throw new LoginFailedError('Username/Email input field not found on login page.');
        },
        this.logger,
        'LocateUsernameInput',
      );

      // 3. Fill Username
      this.logger.info('Entering username...');
      await retryOperation(
        async () => {
          await page.locator(usernameSelector).fill(this.config.USERNAME);
        },
        this.logger,
        'FillUsername',
      );

      // 3.5 Click "NEXT" button
      this.logger.info('Clicking NEXT button to proceed to password step...');
      await retryOperation(
        async () => {
          const nextButton = page
            .locator('button, input[type="button"], input[type="submit"]')
            .filter({ hasText: /^(NEXT|Next|Proceed|Continue)$/i })
            .first();

          if (await nextButton.isVisible({ timeout: 2000 }).catch(() => false)) {
            await nextButton.click();
          } else {
            // fallback: press Enter key in username input field
            await page.locator(usernameSelector).press('Enter');
          }
          // Wait brief moment for the fields transition animation
          await page.waitForTimeout(2000);
        },
        this.logger,
        'ClickNextButton',
      );

      // 4. Check for and fill password input
      const passwordSelector = await retryOperation(
        async () => {
          const selectors = [
            'input[name="password"]',
            'input[type="password"]',
            'input[placeholder*="Password" i]',
          ];
          for (const sel of selectors) {
            const loc = page.locator(sel).first();
            // Wait up to 3 seconds for the field to fade in and be visible in DOM
            const isVisible = await loc
              .waitFor({ state: 'visible', timeout: 3000 })
              .then(() => true)
              .catch(() => false);

            if (isVisible) {
              return sel;
            }
          }
          throw new LoginFailedError('Password input field not found on login page.');
        },
        this.logger,
        'LocatePasswordInput',
      );

      this.logger.info('Entering password...');
      await retryOperation(
        async () => {
          await page.locator(passwordSelector).fill(this.config.PASSWORD);
        },
        this.logger,
        'FillPassword',
      );

      // 5. Submit Form
      this.logger.info('Submitting credentials...');
      await retryOperation(
        async () => {
          const submitSelectors = [
            'button:has-text("LOG IN")',
            'button:has-text("Log In")',
            'button:has-text("Login")',
            'button:has-text("Sign In")',
            'button[type="submit"]',
            'input[type="submit"]',
          ];

          for (const sel of submitSelectors) {
            const locator = page.locator(sel).first();
            if (await locator.isVisible().catch(() => false)) {
              await locator.click();
              return;
            }
          }

          // Fallback: search for any visible button containing log/sign/submit text
          const fallbackBtn = page
            .locator('button, [role="button"]')
            .filter({ hasText: /^(LOG IN|Log In|Login|Sign In|Submit)$/i })
            .first();

          if (await fallbackBtn.isVisible().catch(() => false)) {
            await fallbackBtn.click();
            return;
          }

          throw new LoginFailedError('Could not locate any visible submit button on login page.');
        },
        this.logger,
        'ClickSubmitButton',
      );

      // 6. Verify Login Success
      this.logger.info('Waiting for dashboard navigation or landing page...');
      const isLoggedIn = await retryOperation(
        async () => {
          // Wait for load state
          await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});

          // Check for URL change or logged-in markers
          const currentUrl = page.url();
          const hasLoggedInClass = await page.evaluate(() => {
            const dashboardMarkers = [
              '.dashboard',
              '#dashboard',
              '[class*="dashboard"]',
              '[class*="profile"]',
              'a[href*="logout"]',
            ];
            return dashboardMarkers.some((selector) => !!document.querySelector(selector));
          });

          if (
            !currentUrl.includes('/login') &&
            !currentUrl.includes('/signin') &&
            hasLoggedInClass
          ) {
            return true;
          }

          // Check if error message is displayed on screen
          const errorMessage = await page.evaluate(() => {
            const errEl = document.querySelector(
              '.error, .alert, [class*="error-message"], [class*="alert-danger"]',
            );
            return errEl ? errEl.textContent?.trim() : null;
          });

          if (errorMessage) {
            throw new LoginFailedError(`Authentication failed with message: "${errorMessage}"`);
          }

          throw new LoginFailedError(
            'Redirect to dashboard did not occur after login form submission.',
          );
        },
        this.logger,
        'VerifyLoginSuccess',
      );

      if (isLoggedIn) {
        this.logger.info('Login Successful.');
        return true;
      }

      throw new LoginFailedError('Login verification failed.');
    } catch (error) {
      this.logger.error('Login process encountered a failure', error);
      throw error instanceof LoginFailedError
        ? error
        : new LoginFailedError((error as Error).message);
    }
  }
}
