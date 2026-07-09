import { IConfig, ILogger, IStorageService } from '../types';
import { retryOperation } from '../retry';

export class TelegramCommandService {
  constructor(
    private readonly config: IConfig,
    private readonly logger: ILogger,
    private readonly storageService: IStorageService,
  ) {}

  /**
   * Polls Telegram updates. Checks if there is an unprocessed '/leave' command sent today.
   * If found:
   *  - Returns the details of the command (received time, etc.).
   *  - Updates the offset to skip reprocessing.
   */
  public async checkForLeaveCommand(): Promise<{ receivedAt: Date; formattedTime: string } | null> {
    if (!this.config.ENABLE_NOTIFICATIONS) {
      return null;
    }

    const token = this.config.TELEGRAM_BOT_TOKEN;
    const targetChatId = String(this.config.TELEGRAM_CHAT_ID).trim();
    const metadata = await this.storageService.getTelegramMetadata();
    const offset = metadata ? metadata.lastProcessedUpdateId + 1 : 0;

    const url = `https://api.telegram.org/bot${token}/getUpdates?offset=${offset}&timeout=5`;

    try {
      this.logger.debug(
        `Polling Telegram updates in checkForLeaveCommand with offset ${offset}...`,
      );

      const updates = await retryOperation(
        async () => {
          const response = await globalThis.fetch(url);
          if (!response.ok) {
            throw new Error(`Failed to fetch updates, status: ${response.status}`);
          }
          const body = await response.json();
          return body.result || [];
        },
        this.logger,
        'TelegramGetUpdates',
        2,
        [1000, 2000],
      );

      // Connection is successful
      await this.storageService.setTelegramMetadata({
        botConnected: true,
        lastSyncTime: new Date().toISOString(),
      });

      let leaveCommandFound: { receivedAt: Date; formattedTime: string; updateId: number } | null =
        null;

      for (const update of updates) {
        const updateId = update.update_id;
        const message = update.message;

        if (!message || !message.text) {
          await this.storageService.setTelegramMetadata({ lastProcessedUpdateId: updateId });
          continue;
        }

        const chatId = String(message.chat.id).trim();
        const text = message.text.trim();
        const receivedAt = new Date(message.date * 1000);

        // Security Check: Only accept messages from configured chat ID
        if (chatId !== targetChatId) {
          await this.storageService.setTelegramMetadata({ lastProcessedUpdateId: updateId });
          continue;
        }

        const cleanCmd = text.toLowerCase().trim();

        // Check if the command is "/leave" or "leave"
        if (cleanCmd === '/leave' || cleanCmd === 'leave') {
          const now = new Date();

          // Verify if sent today in target timezone
          const getLocalDateString = (d: Date, tz: string) =>
            d.toLocaleDateString('en-US', {
              timeZone: tz,
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
            });

          const msgDateStr = getLocalDateString(receivedAt, this.config.TIMEZONE);
          const todayDateStr = getLocalDateString(now, this.config.TIMEZONE);

          if (msgDateStr === todayDateStr) {
            const formattedTime = receivedAt.toLocaleTimeString('en-IN', {
              timeZone: this.config.TIMEZONE,
              hour: '2-digit',
              minute: '2-digit',
              hour12: true,
            });

            leaveCommandFound = { receivedAt, formattedTime, updateId };
          }
        }

        // Keep updating offset to mark all processed messages (including other non-matching messages from target user)
        await this.storageService.setTelegramMetadata({ lastProcessedUpdateId: updateId });
      }

      if (leaveCommandFound) {
        this.logger.info(
          `Found unprocessed today's /leave command received at ${leaveCommandFound.formattedTime}`,
        );
        return {
          receivedAt: leaveCommandFound.receivedAt,
          formattedTime: leaveCommandFound.formattedTime,
        };
      }
    } catch (error) {
      this.logger.error('Failed to check for Telegram /leave command', error);
      await this.storageService.setTelegramMetadata({
        botConnected: false,
        lastSyncTime: new Date().toISOString(),
      });
    }

    return null;
  }

  /**
   * For backward compatibility and background sync polling in Server Mode.
   */
  public async pollForUpdates(): Promise<void> {
    const leaveCmd = await this.checkForLeaveCommand();
    if (leaveCmd) {
      // Set skip state for today
      await this.storageService.setTodayState(false, 'telegram');

      // Update command details
      await this.storageService.setTelegramMetadata({
        lastCommand: 'Leave',
        lastCommandTime: leaveCmd.receivedAt.toISOString(),
      });

      // Send the skip notification if not already sent
      // Check history to see if we already sent this skip notification to avoid spamming
      const history = await this.storageService.getHistory();
      const alreadySent = history.some(
        (h) =>
          h.action === 'Leave (/leave received)' &&
          h.receivedAt === leaveCmd.receivedAt.toISOString(),
      );

      if (!alreadySent) {
        await this.storageService.addHistoryEntry(
          'Leave (/leave received)',
          'Telegram',
          leaveCmd.receivedAt,
          new Date(),
        );

        const skipMsg = `⏸ Attendance skipped.\n\nReason:\n/leave received at ${leaveCmd.formattedTime}.`;
        await this.sendReply(Number(this.config.TELEGRAM_CHAT_ID), skipMsg);
      }
    }
  }

  /**
   * Helper to dispatch response message back to the active Telegram Chat ID.
   */
  public async sendReply(chatId: number, message: string): Promise<boolean> {
    const token = this.config.TELEGRAM_BOT_TOKEN;
    const url = `https://api.telegram.org/bot${token}/sendMessage`;

    try {
      await retryOperation(
        async () => {
          const response = await globalThis.fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              text: message,
              parse_mode: 'HTML',
            }),
          });
          if (!response.ok) {
            throw new Error(`Failed to send reply, status: ${response.status}`);
          }
        },
        this.logger,
        'TelegramSendReply',
        2,
        [1000, 2000],
      );
      return true;
    } catch (err) {
      this.logger.error(`Failed to send Telegram reply to chat: ${chatId}`, err);
      return false;
    }
  }
}
