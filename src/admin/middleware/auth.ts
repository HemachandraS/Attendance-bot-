import { Request, Response, NextFunction } from 'express';

declare module 'express-session' {
  interface SessionData {
    isAuthenticated?: boolean;
  }
}

/**
 * Route protection middleware to assert session-based admin authorization.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (req.session && req.session.isAuthenticated) {
    return next();
  }
  res.redirect('/login');
}
