export interface RetryOptions {
  maxRetries?: number;
  backoffMs?: number;
  shouldRetry?: (error: any) => boolean;
}

/**
 * Execute a function with exponential backoff retry logic
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 3,
    backoffMs = 1000,
    shouldRetry = (error) => {
      // Retry on rate limits and server errors
      const status = error?.status || error?.code;
      return status === 429 || (status >= 500 && status < 600);
    }
  } = options;

  let lastError: any;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Don't retry if not a retryable error or if this was the last attempt
      if (!shouldRetry(error) || attempt === maxRetries - 1) {
        throw error;
      }

      // Exponential backoff with jitter
      const delay = backoffMs * Math.pow(2, attempt) + Math.random() * 100;
      console.log(`Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms`);

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

/**
 * Sleep utility function
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
