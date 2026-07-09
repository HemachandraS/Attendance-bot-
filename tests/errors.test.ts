import {
  AttendanceBotError,
  ConfigurationError,
  BrowserLaunchError,
  LoginFailedError,
  AttendanceButtonNotFound,
  AttendanceAlreadyMarked,
  SessionExpired,
  ScreenshotFailed,
} from '../src/utils/errors';

describe('Custom Errors', () => {
  it('should instantiate and structure AttendanceBotError', () => {
    const error = new AttendanceBotError('Base error');
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('AttendanceBotError');
    expect(error.message).toBe('Base error');
    expect(error.stack).toBeDefined();
  });

  it('should format ConfigurationError correctly', () => {
    const error = new ConfigurationError('Missing key');
    expect(error).toBeInstanceOf(AttendanceBotError);
    expect(error.name).toBe('ConfigurationError');
    expect(error.message).toBe('[Configuration Error] Missing key');
  });

  it('should format BrowserLaunchError and wrap original error', () => {
    const original = new Error('Chrome binary not found');
    const error = new BrowserLaunchError('Launch failed', original);
    expect(error).toBeInstanceOf(AttendanceBotError);
    expect(error.name).toBe('BrowserLaunchError');
    expect(error.message).toBe('[Browser Launch Error] Launch failed: Chrome binary not found');
    expect(error.originalError).toBe(original);
  });

  it('should format LoginFailedError correctly', () => {
    const error = new LoginFailedError('Invalid credentials');
    expect(error).toBeInstanceOf(AttendanceBotError);
    expect(error.name).toBe('LoginFailedError');
    expect(error.message).toBe('[Login Failed Error] Invalid credentials');
  });

  it('should format AttendanceButtonNotFound correctly', () => {
    const error = new AttendanceButtonNotFound('Card selector missing');
    expect(error).toBeInstanceOf(AttendanceBotError);
    expect(error.name).toBe('AttendanceButtonNotFound');
    expect(error.message).toBe('[Attendance Button Not Found] Card selector missing');
  });

  it('should format AttendanceAlreadyMarked correctly', () => {
    const error = new AttendanceAlreadyMarked('Already punched out');
    expect(error).toBeInstanceOf(AttendanceBotError);
    expect(error.name).toBe('AttendanceAlreadyMarked');
    expect(error.message).toBe('[Attendance Already Marked] Already punched out');
  });

  it('should format SessionExpired correctly', () => {
    const error = new SessionExpired('Cookies expired');
    expect(error).toBeInstanceOf(AttendanceBotError);
    expect(error.name).toBe('SessionExpired');
    expect(error.message).toBe('[Session Expired] Cookies expired');
  });

  it('should format ScreenshotFailed correctly', () => {
    const original = new Error('Disk full');
    const error = new ScreenshotFailed('Could not write image', original);
    expect(error).toBeInstanceOf(AttendanceBotError);
    expect(error.name).toBe('ScreenshotFailed');
    expect(error.message).toBe('[Screenshot Failed] Could not write image: Disk full');
    expect(error.originalError).toBe(original);
  });
});
