import { ILogger } from '../types';

/**
 * Executes a function with a specified retry policy (exponential backoff) in case of errors.
 * Default policy is maximum 3 retries, with backoff delays of 2s, 4s, and 8s.
 */
export async function retryOperation<T>(
  operation: () => Promise<T>,
  logger: ILogger,
  operationName: string,
  maxRetries = 3,
  delays = [2000, 4000, 8000],
): Promise<T> {
  let attempt = 0;
  for (;;) {
    try {
      return await operation();
    } catch (error) {
      attempt++;
      if (attempt > maxRetries) {
        logger.error(
          `Operation "${operationName}" failed permanently after ${maxRetries} attempts.`,
        );
        throw error;
      }
      const delay = delays[attempt - 1] ?? delays[delays.length - 1];
      logger.warn(
        `Operation "${operationName}" failed on attempt ${attempt}/${maxRetries}. Retrying in ${delay}ms...`,
        error,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}
