import { BrowserContext, Page } from 'playwright';

export interface AttendanceResponse {
  success: boolean;
  alreadyMarked: boolean;
  message: string;
  timestamp: Date;
}

export interface IConfig {
  HRONE_URL: string;
  USERNAME: string;
  PASSWORD: string;
  HEADLESS: boolean;
  TIMEZONE: string;
  SESSION_FILE_PATH: string;
  ADMIN_USERNAME: string;
  ADMIN_PASSWORD: string;
  ADMIN_PORT: number;
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_CHAT_ID: string;
  ENABLE_NOTIFICATIONS: boolean;
}

export interface ILogger {
  info(message: string, ...meta: unknown[]): void;
  error(message: string, error?: unknown, ...meta: unknown[]): void;
  warn(message: string, ...meta: unknown[]): void;
  debug(message: string, ...meta: unknown[]): void;
}

export interface IBrowserService {
  launch(): Promise<BrowserContext>;
  close(): Promise<void>;
  getPage(): Promise<Page>;
  saveState(context: BrowserContext): Promise<void>;
}

export interface ILoginService {
  login(page: Page): Promise<boolean>;
  isSessionValid(page: Page): Promise<boolean>;
}

export interface IAttendanceService {
  markAttendance(page: Page): Promise<AttendanceResponse>;
}

export interface IScreenshotService {
  capture(page: Page): Promise<string>;
}

export interface LastRunInfo {
  timestamp: string;
  status: string;
  message?: string;
}

export interface IStorageService {
  isDateSkipped(dateStr: string): Promise<boolean>;
  setDateSkip(dateStr: string, skip: boolean): Promise<void>;
  getLastRun(): Promise<LastRunInfo | null>;
  setLastRun(status: string, message?: string): Promise<void>;
}

export interface INotificationService {
  sendSuccess(time: Date, isAlreadyMarked: boolean, screenshotPath?: string): Promise<boolean>;
  sendFailure(errorMessage: string, time: Date, screenshotPath?: string): Promise<boolean>;
  sendSkipped(reason: string): Promise<boolean>;
  sendTestRun(screenshotPath?: string): Promise<boolean>;
  sendUnexpectedError(stackTrace: string, time: Date, screenshotPath?: string): Promise<boolean>;
  sendMessage(message: string): Promise<boolean>;
}
