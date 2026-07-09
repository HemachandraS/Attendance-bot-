import { ConfigService } from './config';
import { LoggerService } from './logger';
import { AttendanceExecutor } from './executor';
import { startAdminServer } from './admin/app';
import { JsonStorageService } from './storage';
import { TelegramCommandService } from './telegram/TelegramCommandService';

async function main() {
  const logger = new LoggerService();

  let config;
  try {
    config = new ConfigService();
  } catch (error) {
    logger.error('Configuration loading failed. Application cannot start.', error);
    process.exit(1);
  }

  // Set up storage and notification-enabled executor
  const storageService = new JsonStorageService(logger);
  const executor = new AttendanceExecutor(config, logger, { storageService });

  // Check if we should boot the Admin Web Server or run a scheduled automation job
  const isServerMode = process.argv.includes('--server') || process.argv.includes('-s');

  if (isServerMode) {
    logger.info('Starting HR One Attendance Bot in SERVER Mode...');
    try {
      startAdminServer(config, logger, storageService, executor);
    } catch (serverError) {
      logger.error('Failed to start Admin Control Panel server', serverError);
      process.exit(1);
    }
  } else {
    logger.info('Starting HR One Attendance Bot in SCHEDULER Mode...');
    try {
      if (config.ENABLE_NOTIFICATIONS) {
        const telegramCommandService = new TelegramCommandService(
          config,
          logger,
          storageService,
          executor,
        );
        logger.info('Syncing latest Telegram commands before check-in execution...');
        await telegramCommandService.pollForUpdates();
      }
      await executor.execute(false);
    } catch (runError) {
      logger.error('Scheduler execution completed with error.', runError);
      process.exit(1);
    }
  }
}

// Execute program entry
main();
