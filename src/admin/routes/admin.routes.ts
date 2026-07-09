import { Router } from 'express';
import { AdminController } from '../controllers/admin.controller';
import { requireAuth } from '../middleware/auth';

/**
 * Factory function to instantiate the express admin routes.
 */
export function createAdminRouter(controller: AdminController): Router {
  const router = Router();

  // Auth operations
  router.get('/login', (req, res) => controller.showLogin(req, res));
  router.post('/login', (req, res) => controller.handleLogin(req, res));
  router.get('/logout', (req, res) => controller.handleLogout(req, res));

  // Dashboard status & control operations
  router.get('/dashboard', requireAuth, (req, res) => controller.showDashboard(req, res));
  router.post('/actions/stop', requireAuth, (req, res) => controller.stopToday(req, res));
  router.post('/actions/enable', requireAuth, (req, res) => controller.enableToday(req, res));
  router.post('/actions/test', requireAuth, (req, res) => controller.triggerTestRun(req, res));

  // Redirect root path to dashboard
  router.get('/', (_req, res) => {
    res.redirect('/dashboard');
  });

  return router;
}
