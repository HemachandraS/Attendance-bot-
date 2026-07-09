import { retryOperation } from '../src/retry';
import { ILogger } from '../src/types';

describe('retryOperation', () => {
  let mockLogger: jest.Mocked<ILogger>;

  beforeEach(() => {
    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    };
  });

  it('should return result if operation succeeds on first attempt', async () => {
    const mockOp = jest.fn().mockResolvedValue('success-payload');

    const result = await retryOperation(mockOp, mockLogger, 'TestOp', 3, [10, 20]);

    expect(result).toBe('success-payload');
    expect(mockOp).toHaveBeenCalledTimes(1);
    expect(mockLogger.warn).not.toHaveBeenCalled();
    expect(mockLogger.error).not.toHaveBeenCalled();
  });

  it('should retry on failure and eventually succeed if an attempt resolves', async () => {
    const mockOp = jest
      .fn()
      .mockRejectedValueOnce(new Error('Fail 1'))
      .mockRejectedValueOnce(new Error('Fail 2'))
      .mockResolvedValue('success-on-third-try');

    // Using short delays: 10ms and 20ms
    const result = await retryOperation(mockOp, mockLogger, 'TestOp', 3, [10, 20]);

    expect(result).toBe('success-on-third-try');
    expect(mockOp).toHaveBeenCalledTimes(3);
    expect(mockLogger.warn).toHaveBeenCalledTimes(2);
    expect(mockLogger.warn).toHaveBeenNthCalledWith(
      1,
      'Operation "TestOp" failed on attempt 1/3. Retrying in 10ms...',
      expect.any(Error),
    );
    expect(mockLogger.warn).toHaveBeenNthCalledWith(
      2,
      'Operation "TestOp" failed on attempt 2/3. Retrying in 20ms...',
      expect.any(Error),
    );
  });

  it('should throw error after reaching max retries', async () => {
    const testError = new Error('Persistent fail');
    const mockOp = jest.fn().mockRejectedValue(testError);

    await expect(retryOperation(mockOp, mockLogger, 'TestOp', 3, [10, 20])).rejects.toThrow(
      'Persistent fail',
    );

    expect(mockOp).toHaveBeenCalledTimes(4); // 1 initial + 3 retries
    expect(mockLogger.error).toHaveBeenCalledWith(
      'Operation "TestOp" failed permanently after 3 attempts.',
    );
  });
});
