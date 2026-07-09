export class AttendanceBotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ConfigurationError extends AttendanceBotError {
  constructor(message: string) {
    super(`[Configuration Error] ${message}`);
  }
}

export class BrowserLaunchError extends AttendanceBotError {
  constructor(
    message: string,
    public originalError?: Error,
  ) {
    super(`[Browser Launch Error] ${message}${originalError ? `: ${originalError.message}` : ''}`);
  }
}

export class LoginFailedError extends AttendanceBotError {
  constructor(message: string) {
    super(`[Login Failed Error] ${message}`);
  }
}

export class AttendanceButtonNotFound extends AttendanceBotError {
  constructor(message: string) {
    super(`[Attendance Button Not Found] ${message}`);
  }
}

export class AttendanceAlreadyMarked extends AttendanceBotError {
  constructor(message: string) {
    super(`[Attendance Already Marked] ${message}`);
  }
}

export class SessionExpired extends AttendanceBotError {
  constructor(message: string) {
    super(`[Session Expired] ${message}`);
  }
}

export class ScreenshotFailed extends AttendanceBotError {
  constructor(
    message: string,
    public originalError?: Error,
  ) {
    super(`[Screenshot Failed] ${message}${originalError ? `: ${originalError.message}` : ''}`);
  }
}
