import * as fs from 'fs';
import * as path from 'path';
import { Page } from 'playwright';
import { IScreenshotService, ILogger } from '../types';
import { ScreenshotFailed } from '../utils/errors';

export class PlaywrightScreenshotService implements IScreenshotService {
  private readonly screenshotsDir: string;

  constructor(private readonly logger: ILogger) {
    this.screenshotsDir = path.join(process.cwd(), 'screenshots');

    // Ensure the screenshots directory exists
    if (!fs.existsSync(this.screenshotsDir)) {
      fs.mkdirSync(this.screenshotsDir, { recursive: true });
    }
  }

  /**
   * Captures a screenshot of the current page and saves it as YYYY-MM-DD_HH-mm.png.
   * Returns the absolute path to the saved screenshot.
   */
  public async capture(page: Page): Promise<string> {
    try {
      this.logger.info('Capturing screenshot of the current page...');

      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');

      const filename = `${year}-${month}-${day}_${hours}-${minutes}.png`;
      const outputPath = path.join(this.screenshotsDir, filename);

      await page.screenshot({
        path: outputPath,
        fullPage: true, // Capture full page view to capture dashboard state and toast notifications
      });

      this.logger.info(`Screenshot Saved: ${outputPath}`);
      return outputPath;
    } catch (error) {
      const ssErr = new ScreenshotFailed('Failed to capture and write screenshot', error as Error);
      this.logger.error('Screenshot capture failed', ssErr);
      throw ssErr;
    }
  }
}
