import { JsonStorageService } from '../src/storage';
import { ILogger } from '../src/types';
import * as fs from 'fs';

jest.mock('fs');

describe('JsonStorageService', () => {
  let mockLogger: jest.Mocked<ILogger>;
  let mockFs: jest.Mocked<typeof fs>;

  beforeEach(() => {
    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    };
    mockFs = fs as unknown as jest.Mocked<typeof fs>;
    mockFs.existsSync.mockReset();
    mockFs.readFileSync.mockReset();
    mockFs.writeFileSync.mockReset();
    mockFs.mkdirSync.mockReset();
  });

  it('should return default skips and lastRun status if database does not exist', async () => {
    mockFs.existsSync.mockReturnValue(false);

    const storage = new JsonStorageService(mockLogger);
    const isSkipped = await storage.isDateSkipped('2026-07-08');
    const lastRun = await storage.getLastRun();

    expect(isSkipped).toBe(false);
    expect(lastRun).toBeNull();
  });

  it('should retrieve skip status if date skip is set to true', async () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue(
      JSON.stringify({
        skips: {
          '2026-07-08': { skip: true },
        },
        lastRun: null,
      }),
    );

    const storage = new JsonStorageService(mockLogger);
    const isSkipped = await storage.isDateSkipped('2026-07-08');

    expect(isSkipped).toBe(true);
  });

  it('should save date skip and write it to the filesystem', async () => {
    mockFs.existsSync.mockReturnValue(false);

    const storage = new JsonStorageService(mockLogger);
    await storage.setDateSkip('2026-07-08', true);

    expect(mockFs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('status.json'),
      expect.stringContaining('"2026-07-08": {\n      "skip": true\n    }'),
      'utf8',
    );
  });

  it('should remove date skip when set to false', async () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue(
      JSON.stringify({
        skips: {
          '2026-07-08': { skip: true },
        },
        lastRun: null,
      }),
    );

    const storage = new JsonStorageService(mockLogger);
    await storage.setDateSkip('2026-07-08', false);

    expect(mockFs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('status.json'),
      expect.stringContaining('"skips": {}'),
      'utf8',
    );
  });

  it('should write last run status details to filesystem', async () => {
    mockFs.existsSync.mockReturnValue(false);

    const storage = new JsonStorageService(mockLogger);
    await storage.setLastRun('Success', 'Marked successfully');

    expect(mockFs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('status.json'),
      expect.stringContaining('"status": "Success"'),
      'utf8',
    );
    expect(mockFs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('status.json'),
      expect.stringContaining('"message": "Marked successfully"'),
      'utf8',
    );
  });
});
