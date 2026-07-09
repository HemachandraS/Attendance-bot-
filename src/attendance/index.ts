import { Page } from 'playwright';
import { IAttendanceService, AttendanceResponse, ILogger, IConfig } from '../types';
import { AttendanceButtonNotFound, AttendanceBotError } from '../utils/errors';
import { retryOperation } from '../retry';

export class HROneAttendanceService implements IAttendanceService {
  constructor(
    private readonly config: IConfig,
    private readonly logger: ILogger,
  ) {}

  /**
   * Navigates to dashboard, locates attendance button, checks status, and marks attendance.
   */
  public async markAttendance(page: Page): Promise<AttendanceResponse> {
    this.logger.info('Navigating to dashboard to check attendance...');

    // 1. Ensure dashboard is loaded
    await retryOperation(
      async () => {
        // Check if the mark attendance button is already visible (e.g. after login redirect finishes)
        const isButtonVisible = await page
          .locator('button, [role="button"]')
          .filter({ hasText: /^(Mark attendance|Clock In|Web Check-In|Punch|Punch In)$/i })
          .first()
          .isVisible()
          .catch(() => false);

        if (isButtonVisible) {
          this.logger.info('Already on the dashboard. Bypassing navigation.');
          return;
        }

        const currentUrl = page.url();
        // If not already on the app workspace path, navigate to the correct app path
        if (!currentUrl.includes('/app') && !currentUrl.includes('/dashboard')) {
          this.logger.info('Navigating to HR One app root URL...');
          const targetUrl = this.config.HRONE_URL.replace(/\/$/, '') + '/app';
          await page
            .goto(targetUrl, {
              waitUntil: 'domcontentloaded',
              timeout: 20000,
            })
            .catch(async () => {
              // fallback to configured base URL
              await page.goto(this.config.HRONE_URL, {
                waitUntil: 'domcontentloaded',
                timeout: 20000,
              });
            });
        }
        await page.waitForLoadState('domcontentloaded');
      },
      this.logger,
      'NavigateToDashboard',
    );

    // 2. Wait for dashboard widgets or page to render fully
    this.logger.info('Waiting for dashboard widgets to load...');
    await page.waitForTimeout(5000); // Allow dynamic widgets to mount

    // 3. Search for the attendance-related button or action element
    const attendanceAction = await retryOperation(
      async () => {
        return await this.findAttendanceButton(page);
      },
      this.logger,
      'FindAttendanceButton',
    );

    if (!attendanceAction) {
      throw new AttendanceButtonNotFound(
        'Could not locate any attendance marking button or widget on the dashboard.',
      );
    }

    const { elementSelector, buttonText, isAlreadyMarked } = attendanceAction;
    this.logger.info(`Found attendance element: "${buttonText}" (Selector: ${elementSelector})`);

    // 4. Check if already marked
    if (isAlreadyMarked) {
      this.logger.info(
        'Attendance already marked today (Detected checked-in state). Skipping click.',
      );
      return {
        success: true,
        alreadyMarked: true,
        message: `Attendance already marked today. Button label was: "${buttonText}"`,
        timestamp: new Date(),
      };
    }

    // 5. Click the Attendance button
    this.logger.info(`Clicking attendance button: "${buttonText}"...`);
    await retryOperation(
      async () => {
        const locator = page.locator(elementSelector).first();
        await locator.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {});
        await locator.click({ timeout: 10000 });
      },
      this.logger,
      'ClickAttendanceButton',
    );

    // 6. Check if click opens a secondary dialog or requires a confirmation check
    // Sometimes HR portals pop up a modal like "Are you sure?" or require selecting a location/reason.
    const modalHandled = await this.handleConfirmationModal(page);
    if (modalHandled) {
      this.logger.info('Handled confirmation modal successfully.');
    }

    // 7. Verify marking success
    this.logger.info('Verifying attendance was successfully marked...');
    const verification = await this.verifyMarkingSuccess(page, elementSelector);

    if (verification.success) {
      this.logger.info('Success: Attendance marked successfully!');
      return {
        success: true,
        alreadyMarked: false,
        message: verification.message || 'Attendance marked successfully',
        timestamp: new Date(),
      };
    }

    throw new AttendanceBotError(
      `Failed to confirm successful attendance marking: ${verification.message}`,
    );
  }

  /**
   * Scans the DOM to identify the attendance button and evaluate whether we are already clocked-in.
   */
  private async findAttendanceButton(page: Page): Promise<{
    elementSelector: string;
    buttonText: string;
    isAlreadyMarked: boolean;
  } | null> {
    // Array of possible selectors and their text match patterns
    return await page.evaluate(() => {
      // Helper to clean and format text
      const cleanText = (str: string | null) => str?.trim().toLowerCase() || '';

      // Keywords that mean we need to "Clock In / Mark Attendance"
      const punchInKeywords = [
        'mark attendance',
        'clock in',
        'check in',
        'punch in',
        'mark in',
        'mark present',
        'punch',
        'web check-in',
        'sign in',
      ];

      // Keywords that mean we are ALREADY clocked in / checked in
      const punchOutKeywords = [
        'clock out',
        'check out',
        'punch out',
        'mark out',
        'clocked in',
        'checked in',
        'already marked',
        'attendance marked',
        'web check-out',
        'sign out',
      ];

      // Scan all buttons, links, and clickables
      const elements = Array.from(
        document.querySelectorAll(
          'button, a, [role="button"], .btn, [class*="button"], [class*="btn"]',
        ),
      );

      for (const el of elements) {
        const text = el.textContent || '';
        const cleaned = cleanText(text);

        // Check if it matches any punch out keywords first (which means we are already marked)
        if (punchOutKeywords.some((keyword) => cleaned.includes(keyword))) {
          // Generate a unique selector or identifier path
          let path = el.tagName.toLowerCase();
          if (el.id) {
            path += `#${el.id}`;
          } else if (el.className) {
            path += `.${Array.from(el.classList).join('.')}`;
          }
          return {
            elementSelector: path,
            buttonText: text.trim(),
            isAlreadyMarked: true,
          };
        }

        // Check if it matches punch in keywords
        if (punchInKeywords.some((keyword) => cleaned.includes(keyword))) {
          let path = el.tagName.toLowerCase();
          if (el.id) {
            path += `#${el.id}`;
          } else if (el.className) {
            // Avoid spaces in classes for selectors
            const classes = Array.from(el.classList)
              .filter((c) => !c.includes(':'))
              .join('.');
            if (classes) {
              path += `.${classes}`;
            }
          }
          return {
            elementSelector: path,
            buttonText: text.trim(),
            isAlreadyMarked: false,
          };
        }
      }

      // Try searching inside div / span text elements that might behave as buttons
      const divElements = Array.from(document.querySelectorAll('div, span'));
      for (const el of divElements) {
        const text = el.textContent || '';
        const cleaned = cleanText(text);

        // Check for specific texts with strict match length to avoid matching huge parent containers
        if (cleaned.length < 30) {
          if (
            punchOutKeywords.some((keyword) => cleaned === keyword || cleaned.includes(keyword))
          ) {
            return {
              elementSelector:
                el.tagName.toLowerCase() +
                (el.className
                  ? `.${Array.from(el.classList)
                      .filter((c) => !c.includes(':'))
                      .join('.')}`
                  : ''),
              buttonText: text.trim(),
              isAlreadyMarked: true,
            };
          }
          if (punchInKeywords.some((keyword) => cleaned === keyword || cleaned.includes(keyword))) {
            return {
              elementSelector:
                el.tagName.toLowerCase() +
                (el.className
                  ? `.${Array.from(el.classList)
                      .filter((c) => !c.includes(':'))
                      .join('.')}`
                  : ''),
              buttonText: text.trim(),
              isAlreadyMarked: false,
            };
          }
        }
      }

      return null;
    });
  }

  /**
   * If clicking the first button opens a verification/location modal, handles clicking the confirm button.
   */
  private async handleConfirmationModal(page: Page): Promise<boolean> {
    try {
      this.logger.info('Waiting for attendance confirmation modal...');

      const modalSelector =
        '.modal, .dialog, [role="dialog"], [class*="modal"], [class*="popup"], .mat-dialog-container, .modal-content';

      // Wait for any dialog overlay or modal to be visible
      const modalLocator = page.locator(modalSelector).first();
      await modalLocator.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});

      const isVisible = await modalLocator.isVisible().catch(() => false);
      if (!isVisible) {
        this.logger.info('No confirmation modal detected. Continuing directly...');
        return false;
      }

      this.logger.info('Confirmation modal detected. Locating remark input...');

      // Locate the remark input field (e.g. textarea) inside the modal
      const remarkLocator = page
        .locator(modalSelector)
        .locator('textarea, input[type="text"]')
        .first();
      if (await remarkLocator.isVisible().catch(() => false)) {
        this.logger.info('Remark textarea found. Filling remark message...');
        await remarkLocator.fill('Web checkin via Bot');
        await page.waitForTimeout(1000);
      } else {
        this.logger.warn('Could not locate any remark input fields in the modal.');
      }

      // Locate the confirmation button specifically (e.g. "Mark attendance" orange button inside the modal)
      this.logger.info('Locating confirmation action button inside modal...');
      const confirmButton = page
        .locator(modalSelector)
        .locator('button, [role="button"], a.btn, input[type="submit"]')
        .filter({
          hasText: /Mark attendance|Confirm|Submit|Yes|OK|Clock In|Mark Present|Save/i,
        })
        .first();

      if (await confirmButton.isVisible().catch(() => false)) {
        this.logger.info(`Clicking confirmation button: "${await confirmButton.textContent()}"`);
        await confirmButton.click({ timeout: 5000 });
        await page.waitForTimeout(3000); // Wait for submission transition
        return true;
      }

      this.logger.warn('Modal was visible but no confirmation action button was found.');
      return false;
    } catch (error) {
      this.logger.error('Error handling confirmation modal', error);
      return false;
    }
  }

  /**
   * Verifies that the attendance check-in succeeded by examining notifications or changes in button labels.
   */
  private async verifyMarkingSuccess(
    page: Page,
    _previousSelector: string,
  ): Promise<{ success: boolean; message: string }> {
    try {
      // 1. Check for success toast notifications
      const toastMessage = await page.evaluate(() => {
        const toasts = [
          '.toast-success',
          '.alert-success',
          '[class*="success"]',
          '[class*="notification"]',
          '[class*="toast"]',
        ];
        for (const selector of toasts) {
          const el = document.querySelector(selector);
          if (el && el.textContent) {
            const text = el.textContent.trim();
            if (
              text.toLowerCase().includes('success') ||
              text.toLowerCase().includes('marked') ||
              text.toLowerCase().includes('saved')
            ) {
              return text;
            }
          }
        }
        return null;
      });

      if (toastMessage) {
        return { success: true, message: `Toast confirmation: "${toastMessage}"` };
      }

      // 2. Wait and check if the original button label has transitioned to "Clock Out" / "Punch Out" / "Checked In"
      await page.waitForTimeout(3000);
      const updatedButton = await this.findAttendanceButton(page);

      if (updatedButton && updatedButton.isAlreadyMarked) {
        return {
          success: true,
          message: `Button state successfully transitioned to: "${updatedButton.buttonText}"`,
        };
      }

      // 3. Last resort: check if any modal is closed and we don't have errors
      const hasErrors = await page.evaluate(() => {
        const errEl = document.querySelector('.error, .alert-danger, [class*="error-message"]');
        return errEl ? errEl.textContent?.trim() : null;
      });

      if (hasErrors) {
        return { success: false, message: `Error message detected: "${hasErrors}"` };
      }

      // If no explicit toast or button text state change but no errors either
      this.logger.warn('Could not explicitly verify state transition via button label or toasts.');
      return {
        success: true,
        message: 'Click operation completed. (Assumed success as no errors were visible)',
      };
    } catch (error) {
      return { success: false, message: (error as Error).message };
    }
  }
}
