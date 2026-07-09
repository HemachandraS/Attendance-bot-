import { ConfigService } from '../src/config';
import { ConfigurationError } from '../src/utils/errors';

jest.mock('dotenv', () => ({
  config: jest.fn(),
}));

describe('ConfigService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    process.env.ADMIN_USERNAME = 'admin';
    process.env.ADMIN_PASSWORD = 'adminpassword';
    process.env.TELEGRAM_BOT_TOKEN = 'mock_bot_token';
    process.env.TELEGRAM_CHAT_ID = 'mock_chat_id';
    process.env.ENABLE_NOTIFICATIONS = 'true';
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should successfully load valid configurations from environment variables', () => {
    process.env.HRONE_URL = 'https://company.hrone.cloud';
    process.env.USERNAME = 'testuser';
    process.env.PASSWORD = 'testpass';
    process.env.HEADLESS = 'false';
    process.env.TIMEZONE = 'UTC';

    const config = new ConfigService();

    expect(config.HRONE_URL).toBe('https://company.hrone.cloud');
    expect(config.USERNAME).toBe('testuser');
    expect(config.PASSWORD).toBe('testpass');
    expect(config.HEADLESS).toBe(false);
    expect(config.TIMEZONE).toBe('UTC');
  });

  it('should fall back to defaults when optional environment variables are missing', () => {
    process.env.HRONE_URL = 'https://company.hrone.cloud';
    process.env.USERNAME = 'testuser';
    process.env.PASSWORD = 'testpass';
    delete process.env.HEADLESS;
    delete process.env.TIMEZONE;

    const config = new ConfigService();

    expect(config.HEADLESS).toBe(true); // default headless is true
    expect(config.TIMEZONE).toBe('Asia/Kolkata'); // default timezone
  });

  it('should throw ConfigurationError if HRONE_URL is missing', () => {
    delete process.env.HRONE_URL;
    process.env.USERNAME = 'testuser';
    process.env.PASSWORD = 'testpass';

    expect(() => new ConfigService()).toThrow(ConfigurationError);
    expect(() => new ConfigService()).toThrow(
      'Required environment variable "HRONE_URL" is missing',
    );
  });

  it('should throw ConfigurationError if USERNAME is missing', () => {
    process.env.HRONE_URL = 'https://company.hrone.cloud';
    delete process.env.USERNAME;
    process.env.PASSWORD = 'testpass';

    expect(() => new ConfigService()).toThrow(ConfigurationError);
    expect(() => new ConfigService()).toThrow(
      'Required environment variable "USERNAME" is missing',
    );
  });

  it('should not throw if Telegram parameters are missing but notifications are disabled', () => {
    process.env.HRONE_URL = 'https://company.hrone.cloud';
    process.env.USERNAME = 'testuser';
    process.env.PASSWORD = 'testpass';
    process.env.ENABLE_NOTIFICATIONS = 'false';
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHAT_ID;

    const config = new ConfigService();
    expect(config.ENABLE_NOTIFICATIONS).toBe(false);
    expect(config.TELEGRAM_BOT_TOKEN).toBe('');
    expect(config.TELEGRAM_CHAT_ID).toBe('');
  });

  it('should throw ConfigurationError if Telegram token is missing when notifications are enabled', () => {
    process.env.HRONE_URL = 'https://company.hrone.cloud';
    process.env.USERNAME = 'testuser';
    process.env.PASSWORD = 'testpass';
    process.env.ENABLE_NOTIFICATIONS = 'true';
    delete process.env.TELEGRAM_BOT_TOKEN;

    expect(() => new ConfigService()).toThrow(ConfigurationError);
    expect(() => new ConfigService()).toThrow(
      'Required environment variable "TELEGRAM_BOT_TOKEN" is missing',
    );
  });
});
