import * as fs from 'fs';
import * as path from 'path';
import {
  IStorageService,
  LastRunInfo,
  ILogger,
  TodayState,
  TelegramMetadata,
  HistoryEntry,
} from '../types';

export class JsonStorageService implements IStorageService {
  private readonly dbPath: string;

  constructor(private readonly logger: ILogger) {
    const storageDir = path.join(process.cwd(), 'storage');
    if (!fs.existsSync(storageDir)) {
      fs.mkdirSync(storageDir, { recursive: true });
    }
    this.dbPath = path.join(storageDir, 'status.json');
  }

  /**
   * Reads and parses the storage JSON database.
   */
  private readDb(): {
    skips: Record<string, { skip: boolean }>;
    lastRun: LastRunInfo | null;
    today?: TodayState;
    telegramMetadata?: TelegramMetadata;
    history?: HistoryEntry[];
  } {
    try {
      if (!fs.existsSync(this.dbPath)) {
        return { skips: {}, lastRun: null };
      }
      const raw = fs.readFileSync(this.dbPath, 'utf8');
      if (!raw || raw.trim() === '') {
        return { skips: {}, lastRun: null };
      }
      return JSON.parse(raw);
    } catch (error) {
      this.logger.error('Failed to read from storage JSON database, returning defaults', error);
      return { skips: {}, lastRun: null };
    }
  }

  /**
   * Writes the updated state to the JSON database.
   */
  private writeDb(data: {
    skips: Record<string, { skip: boolean }>;
    lastRun: LastRunInfo | null;
    today?: TodayState;
    telegramMetadata?: TelegramMetadata;
    history?: HistoryEntry[];
  }): void {
    try {
      fs.writeFileSync(this.dbPath, JSON.stringify(data, null, 2), 'utf8');
    } catch (error) {
      this.logger.error('Failed to write to storage JSON database', error);
    }
  }

  /**
   * Check if a specific date is set to be skipped.
   */
  public async isDateSkipped(dateStr: string): Promise<boolean> {
    const todayStr = new Date().toISOString().split('T')[0];
    if (dateStr === todayStr) {
      const todayState = await this.getTodayState();
      return !todayState.enabled;
    }
    const data = this.readDb();
    return !!data.skips[dateStr]?.skip;
  }

  /**
   * Disable/Enable run execution for a specific date.
   */
  public async setDateSkip(dateStr: string, skip: boolean): Promise<void> {
    const todayStr = new Date().toISOString().split('T')[0];
    if (dateStr === todayStr) {
      await this.setTodayState(!skip, 'dashboard');
      // Record in command history
      await this.addHistoryEntry(skip ? 'Leave' : 'Enable', 'Dashboard', new Date(), new Date());
      return;
    }
    const data = this.readDb();
    if (skip) {
      data.skips[dateStr] = { skip: true };
    } else {
      delete data.skips[dateStr];
    }
    this.writeDb(data);
  }

  /**
   * Fetch details about the last executed run.
   */
  public async getLastRun(): Promise<LastRunInfo | null> {
    const data = this.readDb();
    return data.lastRun;
  }

  /**
   * Log details of a run execution.
   */
  public async setLastRun(status: string, message?: string): Promise<void> {
    const data = this.readDb();
    data.lastRun = {
      timestamp: new Date().toISOString(),
      status,
      message,
    };
    this.writeDb(data);
  }

  /**
   * Retrieves today's execution state, defaulting to enabled if missing or expired.
   */
  public async getTodayState(): Promise<TodayState> {
    const data = this.readDb();
    const todayStr = new Date().toISOString().split('T')[0];

    if (data.today && data.today.updatedAt.startsWith(todayStr)) {
      return data.today;
    }

    return {
      enabled: true,
      updatedBy: 'scheduler',
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * Sets today's execution state.
   */
  public async setTodayState(
    enabled: boolean,
    updatedBy: 'telegram' | 'dashboard' | 'scheduler',
  ): Promise<void> {
    const data = this.readDb();
    data.today = {
      enabled,
      updatedBy,
      updatedAt: new Date().toISOString(),
    };
    this.writeDb(data);
  }

  /**
   * Retrieves Telegram metadata.
   */
  public async getTelegramMetadata(): Promise<TelegramMetadata | null> {
    const data = this.readDb();
    return data.telegramMetadata || null;
  }

  /**
   * Updates Telegram metadata.
   */
  public async setTelegramMetadata(metadata: Partial<TelegramMetadata>): Promise<void> {
    const data = this.readDb();
    if (!data.telegramMetadata) {
      data.telegramMetadata = {
        lastProcessedUpdateId: 0,
        lastSyncTime: new Date().toISOString(),
        botConnected: true,
        lastCommand: 'None',
        lastCommandTime: 'N/A',
      };
    }
    data.telegramMetadata = {
      ...data.telegramMetadata,
      ...metadata,
    };
    this.writeDb(data);
  }

  /**
   * Retrieves all command/execution history log entries.
   */
  public async getHistory(): Promise<HistoryEntry[]> {
    const data = this.readDb();
    return data.history || [];
  }

  /**
   * Adds an entry to the action history logs.
   */
  public async addHistoryEntry(
    action: string,
    source: 'Telegram' | 'Dashboard',
    receivedAt: Date,
    processedAt: Date,
  ): Promise<void> {
    const data = this.readDb();
    if (!data.history) {
      data.history = [];
    }
    data.history.push({
      action,
      source,
      receivedAt: receivedAt.toISOString(),
      processedAt: processedAt.toISOString(),
    });

    // Keep history clean by capping at 100 entries
    if (data.history.length > 100) {
      data.history.shift();
    }
    this.writeDb(data);
  }
}
