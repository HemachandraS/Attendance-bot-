import * as fs from 'fs';
import * as path from 'path';
import { IStorageService, LastRunInfo, ILogger } from '../types';

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
  private readDb(): { skips: Record<string, { skip: boolean }>; lastRun: LastRunInfo | null } {
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
    const data = this.readDb();
    return !!data.skips[dateStr]?.skip;
  }

  /**
   * Disable/Enable run execution for a specific date.
   */
  public async setDateSkip(dateStr: string, skip: boolean): Promise<void> {
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
}
