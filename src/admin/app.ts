import express from 'express';
import session from 'express-session';
import * as path from 'path';
import { IConfig, ILogger, IStorageService } from '../types';
import { AttendanceExecutor } from '../executor';
import { AdminController } from './controllers/admin.controller';
import { createAdminRouter } from './routes/admin.routes';
import { TelegramCommandService } from '../telegram/TelegramCommandService';

/**
 * Bootstraps and starts the Express Admin Web Portal.
 */
export function startAdminServer(
  config: IConfig,
  logger: ILogger,
  storageService: IStorageService,
  executor: AttendanceExecutor,
): express.Application {
  const app = express();

  // Set views path and template engine (EJS)
  // When running built JS, __dirname will be 'dist/admin', so we target its local 'views' folder
  app.set('views', path.join(__dirname, 'views'));
  app.set('view engine', 'ejs');

  // Request parses middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Session middleware configuration
  app.use(
    session({
      secret: config.ADMIN_PASSWORD || 'default-session-secret-key',
      resave: false,
      saveUninitialized: false,
      cookie: {
        maxAge: 60 * 60 * 1000, // 1 hour session expiration
        secure: false, // set true for prod environments using SSL
        httpOnly: true,
      },
    }),
  );

  // Set up Admin routes
  const controller = new AdminController(config, logger, storageService, executor);
  const router = createAdminRouter(controller);
  app.use('/', router);

  // Global Express request error boundaries
  app.use(
    (err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      logger.error('Unhandled request error occurred on Admin portal', err);
      res.status(500).send('Internal Server Error. Please contact support.');
    },
  );

  app.listen(config.ADMIN_PORT, () => {
    logger.info(`Admin Control Panel Web App running at http://localhost:${config.ADMIN_PORT}`);
  });

  // Start background command polling if notifications are enabled
  if (config.ENABLE_NOTIFICATIONS) {
    const telegramCmdService = new TelegramCommandService(config, logger, storageService, executor);
    logger.info('Starting background Telegram command sync loop (15s interval)...');

    // Run an initial sync immediately upon server start
    telegramCmdService.pollForUpdates().catch((err) => {
      logger.error('Initial Telegram command sync failed', err);
    });

    setInterval(async () => {
      try {
        await telegramCmdService.pollForUpdates();
      } catch (err) {
        logger.error('Failed to sync Telegram commands in background loop', err);
      }
    }, 15000);
  }

  return app;
}
