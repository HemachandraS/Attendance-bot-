import { IConfig, ILogger, IStorageService } from '../types';
import { AttendanceExecutor } from '../executor';
import { retryOperation } from '../retry';

export class TelegramCommandService {
  constructor(
    private readonly config: IConfig,
    private readonly logger: ILogger,
    private readonly storageService: IStorageService,
    private readonly executor: AttendanceExecutor,
  ) {}

  /**
   * Polls Telegram getUpdates API for any new messages/commands and processes them.
   */
  public async pollForUpdates(): Promise<void> {
    if (!this.config.ENABLE_NOTIFICATIONS) {
      return;
    }

    const token = this.config.TELEGRAM_BOT_TOKEN;
    const targetChatId = String(this.config.TELEGRAM_CHAT_ID).trim();
    const metadata = await this.storageService.getTelegramMetadata();
    const offset = metadata ? metadata.lastProcessedUpdateId + 1 : 0;

    const url = `https://api.telegram.org/bot${token}/getUpdates?offset=${offset}&timeout=5`;

    try {
      this.logger.debug(`Polling Telegram updates with offset ${offset}...`);

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

      // Update sync connection state
      await this.storageService.setTelegramMetadata({
        botConnected: true,
        lastSyncTime: new Date().toISOString(),
      });

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
        const processedAt = new Date();

        // Security Check: Only accept messages originating from the configured chat ID
        if (chatId !== targetChatId) {
          this.logger.warn(
            `Security Warning: Unauthorized Telegram command attempt from Chat ID: "${chatId}" (Expected: "${targetChatId}"). Content: "${text}"`,
          );
          await this.storageService.setTelegramMetadata({ lastProcessedUpdateId: updateId });
          continue;
        }

        this.logger.info(`Processing authorized Telegram command: "${text}"`);
        await this.processCommand(Number(chatId), text, receivedAt, processedAt);
        await this.storageService.setTelegramMetadata({ lastProcessedUpdateId: updateId });
      }
    } catch (error) {
      this.logger.error('Failed to retrieve Telegram updates', error);
      await this.storageService.setTelegramMetadata({
        botConnected: false,
        lastSyncTime: new Date().toISOString(),
      });
    }
  }

  /**
   * Parses and executes matched commands, writing to storage and acknowledging via chat reply.
   */
  private async processCommand(
    chatId: number,
    text: string,
    receivedAt: Date,
    processedAt: Date,
  ): Promise<void> {
    const cleanCmd = text.toLowerCase().replace(/^\//, '').trim();

    if (cleanCmd === 'leave') {
      await this.storageService.setTodayState(false, 'telegram');
      await this.storageService.addHistoryEntry('Leave', 'Telegram', receivedAt, processedAt);
      await this.storageService.setTelegramMetadata({
        lastCommand: 'Leave',
        lastCommandTime: processedAt.toISOString(),
      });
      await this.sendReply(chatId, '✅ Attendance has been disabled for today.');
    } else if (cleanCmd === 'enable') {
      await this.storageService.setTodayState(true, 'telegram');
      await this.storageService.addHistoryEntry('Enable', 'Telegram', receivedAt, processedAt);
      await this.storageService.setTelegramMetadata({
        lastCommand: 'Enable',
        lastCommandTime: processedAt.toISOString(),
      });
      await this.sendReply(chatId, '✅ Attendance has been enabled for today.');
    } else if (cleanCmd === 'status') {
      const todayState = await this.storageService.getTodayState();
      const lastRun = await this.storageService.getLastRun();
      const nextRunTime = this.calculateNextRun();

      let lastRunFormatted = 'Never Executed';
      let lastResultFormatted = 'N/A';

      if (lastRun) {
        lastRunFormatted = new Date(lastRun.timestamp).toLocaleString('en-IN', {
          timeZone: this.config.TIMEZONE,
        });
        lastResultFormatted = lastRun.status;
        if (lastRun.message) {
          lastResultFormatted += ` (${lastRun.message})`;
        }
      }

      const statusMsg =
        `Today's Attendance\n\n` +
        `Status:\n${todayState.enabled ? 'Enabled' : 'Disabled'}\n\n` +
        `Last Run:\n${lastRunFormatted}\n\n` +
        `Last Result:\n${lastResultFormatted}\n\n` +
        `Next Scheduled Run:\n${nextRunTime}`;

      await this.storageService.addHistoryEntry('Status', 'Telegram', receivedAt, processedAt);
      await this.storageService.setTelegramMetadata({
        lastCommand: 'Status',
        lastCommandTime: processedAt.toISOString(),
      });
      await this.sendReply(chatId, statusMsg);
    } else if (cleanCmd === 'run') {
      await this.storageService.addHistoryEntry('Run', 'Telegram', receivedAt, processedAt);
      await this.storageService.setTelegramMetadata({
        lastCommand: 'Run',
        lastCommandTime: processedAt.toISOString(),
      });
      await this.sendReply(chatId, '🧪 Starting Test Run...');

      try {
        await this.executor.execute(true);
        await this.sendReply(chatId, '✅ Attendance marked successfully.');
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        this.logger.error('Telegram-triggered manual execution failed', err);
        await this.sendReply(chatId, `❌ Attendance failed: ${errorMsg}`);
      }
    } else if (cleanCmd === 'help') {
      const helpMsg =
        `Available Commands:\n` +
        `Leave - Disable today's execution\n` +
        `Enable - Enable today's execution\n` +
        `Status - View current status\n` +
        `Run - Trigger manual check-in\n` +
        `Help - View help menu`;

      await this.storageService.addHistoryEntry('Help', 'Telegram', receivedAt, processedAt);
      await this.storageService.setTelegramMetadata({
        lastCommand: 'Help',
        lastCommandTime: processedAt.toISOString(),
      });
      await this.sendReply(chatId, helpMsg);
    } else {
      await this.sendReply(chatId, `❓ Unknown command. Type Help to see available commands.`);
    }
  }

  /**
   * Helper to dispatch response message back to the active Telegram Chat ID.
   */
  private async sendReply(chatId: number, message: string): Promise<boolean> {
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

  /**
   * Calculates next scheduled weekday execution at 10:00 AM.
   */
  private calculateNextRun(): string {
    const now = new Date();
    const target = new Date();
    target.setHours(10, 0, 0, 0);

    if (now.getTime() >= target.getTime()) {
      target.setDate(target.getDate() + 1);
    }

    while (target.getDay() === 0 || target.getDay() === 6) {
      target.setDate(target.getDate() + 1);
    }

    return (
      target.toLocaleString('en-IN', {
        timeZone: this.config.TIMEZONE,
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }) + ' IST'
    );
  }
}
