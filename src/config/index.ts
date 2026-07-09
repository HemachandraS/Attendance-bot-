import * as dotenv from 'dotenv';
import * as path from 'path';
import { IConfig } from '../types';
import { ConfigurationError } from '../utils/errors';

export class ConfigService implements IConfig {
  public readonly HRONE_URL: string;
  public readonly USERNAME: string;
  public readonly PASSWORD: string;
  public readonly HEADLESS: boolean;
  public readonly TIMEZONE: string;
  public readonly SESSION_FILE_PATH: string;
  public readonly ADMIN_USERNAME: string;
  public readonly ADMIN_PASSWORD: string;
  public readonly ADMIN_PORT: number;
  public readonly TELEGRAM_BOT_TOKEN: string;
  public readonly TELEGRAM_CHAT_ID: string;
  public readonly ENABLE_NOTIFICATIONS: boolean;

  constructor() {
    // Load .env file
    dotenv.config();

    this.HRONE_URL = this.getRequiredEnv('HRONE_URL');
    this.USERNAME = this.getRequiredEnv('USERNAME');
    this.PASSWORD = this.getRequiredEnv('PASSWORD');
    this.ADMIN_USERNAME = this.getRequiredEnv('ADMIN_USERNAME');
    this.ADMIN_PASSWORD = this.getRequiredEnv('ADMIN_PASSWORD');

    this.HEADLESS = process.env.HEADLESS !== 'false'; // defaults to true unless explicitly 'false'
    this.TIMEZONE = process.env.TIMEZONE || 'Asia/Kolkata';
    this.ADMIN_PORT = parseInt(process.env.ADMIN_PORT || '3000', 10);

    // session file saved inside the project folder
    this.SESSION_FILE_PATH =
      process.env.SESSION_FILE_PATH || path.join(process.cwd(), 'session.json');

    this.ENABLE_NOTIFICATIONS = process.env.ENABLE_NOTIFICATIONS !== 'false';

    if (this.ENABLE_NOTIFICATIONS) {
      this.TELEGRAM_BOT_TOKEN = this.getRequiredEnv('TELEGRAM_BOT_TOKEN');
      this.TELEGRAM_CHAT_ID = this.getRequiredEnv('TELEGRAM_CHAT_ID');
    } else {
      this.TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
      this.TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';
    }
  }

  private getRequiredEnv(key: string): string {
    const value = process.env[key];
    if (!value || value.trim() === '') {
      throw new ConfigurationError(`Required environment variable "${key}" is missing or empty.`);
    }
    return value;
  }
}
