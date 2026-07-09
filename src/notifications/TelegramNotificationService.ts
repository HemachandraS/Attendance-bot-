import * as fs from 'fs';
import * as path from 'path';
import { INotificationService, IConfig, ILogger } from '../types';
import { retryOperation } from '../retry';

export class TelegramNotificationService implements INotificationService {
  constructor(
    private readonly config: IConfig,
    private readonly logger: ILogger,
  ) {}

  /**
   * Helper to format JavaScript Dates into a readable IST timestamp string.
   */
  private getFormattedTime(date: Date = new Date()): string {
    return (
      date.toLocaleString('en-US', {
        timeZone: 'Asia/Kolkata',
        dateStyle: 'full',
        timeStyle: 'medium',
      }) + ' IST'
    );
  }

  /**
   * Dispatch success text and optional screenshot.
   */
  public async sendSuccess(
    time: Date,
    isAlreadyMarked: boolean,
    screenshotPath?: string,
  ): Promise<boolean> {
    if (!this.config.ENABLE_NOTIFICATIONS) {
      this.logger.info('Notifications are disabled. Skipping Telegram success dispatch.');
      return true;
    }

    const formattedTime = this.getFormattedTime(time);
    let text = '';
    if (isAlreadyMarked) {
      text = `ℹ️ <b>HR One Attendance</b>\n\nToday's attendance was already marked.`;
    } else {
      text = `✅ Attendance marked successfully.`;
    }

    return this.sendNotificationFlow(text, screenshotPath, formattedTime);
  }

  /**
   * Dispatch failure description and optional error page capture.
   */
  public async sendFailure(
    errorMessage: string,
    time: Date,
    screenshotPath?: string,
  ): Promise<boolean> {
    if (!this.config.ENABLE_NOTIFICATIONS) {
      this.logger.info('Notifications are disabled. Skipping Telegram failure dispatch.');
      return true;
    }

    const formattedTime = this.getFormattedTime(time);
    const text = `❌ <b>HR One Attendance Failed</b>\n\nReason:\n${errorMessage}\n\nTime:\n${formattedTime}`;

    return this.sendNotificationFlow(text, screenshotPath, formattedTime);
  }

  /**
   * Dispatch skip alerts (Stop For Today status).
   */
  public async sendSkipped(reason: string): Promise<boolean> {
    if (!this.config.ENABLE_NOTIFICATIONS) {
      this.logger.info('Notifications are disabled. Skipping Telegram skip dispatch.');
      return true;
    }

    const text = `⏸ <b>Attendance Scheduler</b>\n\nToday's execution was skipped.\n\nReason:\n${reason}`;
    return this.sendMessage(text);
  }

  /**
   * Dispatch dashboard-triggered verification test status.
   */
  public async sendTestRun(screenshotPath?: string): Promise<boolean> {
    if (!this.config.ENABLE_NOTIFICATIONS) {
      this.logger.info('Notifications are disabled. Skipping Telegram test run dispatch.');
      return true;
    }

    const formattedTime = this.getFormattedTime();
    const text = `🧪 <b>Test Run</b>\n\nAttendance workflow completed successfully.`;
    return this.sendNotificationFlow(text, screenshotPath, formattedTime);
  }

  /**
   * Dispatch unexpected exception details.
   */
  public async sendUnexpectedError(
    stackTrace: string,
    time: Date,
    screenshotPath?: string,
  ): Promise<boolean> {
    if (!this.config.ENABLE_NOTIFICATIONS) {
      this.logger.info('Notifications are disabled. Skipping Telegram unexpected error dispatch.');
      return true;
    }

    const formattedTime = this.getFormattedTime(time);
    const trimmedStack =
      stackTrace.length > 3000 ? stackTrace.substring(0, 3000) + '\n... (truncated)' : stackTrace;
    const text = `🚨 <b>Attendance Bot</b>\n\nUnexpected Error\n\n<pre>${trimmedStack}</pre>`;

    return this.sendNotificationFlow(text, screenshotPath, formattedTime);
  }

  /**
   * Sends text and optional image with failsafe fallback coverage.
   */
  private async sendNotificationFlow(
    text: string,
    screenshotPath: string | undefined,
    formattedTime: string,
  ): Promise<boolean> {
    let photoSent = false;
    if (screenshotPath && fs.existsSync(screenshotPath)) {
      try {
        this.logger.info('Sending Telegram Notification with screenshot...');
        const caption = `Attendance Screenshot\n\nTimestamp:\n${formattedTime}`;
        photoSent = await this.sendPhoto(screenshotPath, caption);
      } catch (error) {
        this.logger.error(
          'Telegram API Error during photo dispatch. Falling back to text message only.',
          error,
        );
      }
    }

    // Send the core text status details
    const textSent = await this.sendMessage(text);
    return textSent || photoSent;
  }

  /**
   * Dispatches text using HTML-formatted bot API endpoints.
   */
  public async sendMessage(message: string): Promise<boolean> {
    if (!this.config.ENABLE_NOTIFICATIONS) {
      return true;
    }

    try {
      this.logger.info('Sending Telegram Notification (Text)...');

      const token = this.config.TELEGRAM_BOT_TOKEN;
      const chatId = this.config.TELEGRAM_CHAT_ID;
      const url = `https://api.telegram.org/bot${token}/sendMessage`;

      await retryOperation(
        async () => {
          const response = await globalThis.fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              chat_id: chatId,
              text: message,
              parse_mode: 'HTML',
            }),
          });

          if (!response.ok) {
            const errBody = await response.text();
            throw new Error(`Telegram API responded with HTTP ${response.status}: ${errBody}`);
          }
        },
        this.logger,
        'SendTelegramMessage',
        3,
        [2000, 4000, 8000],
      );

      this.logger.info('Telegram Notification Sent');
      return true;
    } catch (error) {
      this.logger.error('Telegram API Error', error);
      return false;
    }
  }

  /**
   * Uploads screenshot binaries as telegram photos.
   */
  private async sendPhoto(filePath: string, caption: string): Promise<boolean> {
    try {
      const token = this.config.TELEGRAM_BOT_TOKEN;
      const chatId = this.config.TELEGRAM_CHAT_ID;
      const url = `https://api.telegram.org/bot${token}/sendPhoto`;

      const fileBuffer = fs.readFileSync(filePath);
      const blob = new Blob([fileBuffer], { type: 'image/png' });
      const formData = new FormData();
      formData.append('chat_id', chatId);
      formData.append('photo', blob, path.basename(filePath));
      formData.append('caption', caption);

      await retryOperation(
        async () => {
          const response = await globalThis.fetch(url, {
            method: 'POST',
            body: formData,
          });

          if (!response.ok) {
            const errBody = await response.text();
            throw new Error(`Telegram API responded with HTTP ${response.status}: ${errBody}`);
          }
        },
        this.logger,
        'SendTelegramPhoto',
        3,
        [2000, 4000, 8000],
      );

      this.logger.info('Screenshot Uploaded');
      return true;
    } catch (error) {
      this.logger.error('Telegram API Error during photo dispatch', error);
      return false;
    }
  }
}
