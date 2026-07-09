import * as fs from 'fs';
import * as path from 'path';
import * as winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import { ILogger } from '../types';

export class LoggerService implements ILogger {
  private logger: winston.Logger;

  constructor() {
    const logsDir = path.join(process.cwd(), 'logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    const logFormat = winston.format.combine(
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      winston.format.errors({ stack: true }),
      winston.format.printf(({ timestamp, level, message, stack, ...metadata }) => {
        let logMsg = `[${timestamp}] [${level.toUpperCase()}]: ${message}`;
        if (Object.keys(metadata).length > 0) {
          logMsg += ` | Metadata: ${JSON.stringify(metadata)}`;
        }
        if (stack) {
          logMsg += `\nStack trace:\n${stack}`;
        }
        return logMsg;
      }),
    );

    this.logger = winston.createLogger({
      level: process.env.LOG_LEVEL || 'info',
      format: logFormat,
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(winston.format.colorize(), logFormat),
        }),
        new DailyRotateFile({
          filename: path.join(logsDir, 'app-%DATE%.log'),
          datePattern: 'YYYY-MM-DD',
          zippedArchive: true,
          maxSize: '20m',
          maxFiles: '14d',
        }),
      ],
    });
  }

  public info(message: string, ...meta: unknown[]): void {
    this.logger.info(message, ...meta);
  }

  public error(message: string, error?: unknown, ...meta: unknown[]): void {
    if (error instanceof Error) {
      this.logger.error(message, { error: error.message, stack: error.stack, ...meta });
    } else {
      this.logger.error(message, { error, ...meta });
    }
  }

  public warn(message: string, ...meta: unknown[]): void {
    this.logger.warn(message, ...meta);
  }

  public debug(message: string, ...meta: unknown[]): void {
    this.logger.debug(message, ...meta);
  }
}
