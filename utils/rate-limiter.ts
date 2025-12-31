/**
 * Rate Limiter for Pipedream API Proxy Requests
 *
 * Implements client-side rate limiting to stay within Pipedream's limits:
 * - API Proxy: 1,000 requests per 5-minute sliding window
 *
 * Features:
 * - Tracks requests in sliding 5-minute window
 * - Automatically delays requests when approaching limit
 * - Configurable buffer to leave safety margin
 */

interface RateLimitConfig {
  requestsPerWindow: number
  windowMs: number
  bufferPercent: number // Percentage to reserve as safety buffer (e.g., 0.1 = 10%)
}

export class RateLimiter {
  private requestTimestamps: number[] = []
  private readonly config: RateLimitConfig

  constructor(config?: Partial<RateLimitConfig>) {
    this.config = {
      requestsPerWindow: config?.requestsPerWindow ?? 1000, // Pipedream API Proxy limit
      windowMs: config?.windowMs ?? 5 * 60 * 1000, // 5 minutes
      bufferPercent: config?.bufferPercent ?? 0.1 // Reserve 10% as buffer (900 effective limit)
    }
  }

  /**
   * Get the effective limit (total limit minus buffer)
   */
  private getEffectiveLimit(): number {
    return Math.floor(this.config.requestsPerWindow * (1 - this.config.bufferPercent))
  }

  /**
   * Clean up timestamps outside the current window
   */
  private cleanupOldTimestamps(now: number): void {
    this.requestTimestamps = this.requestTimestamps.filter(
      ts => now - ts < this.config.windowMs
    )
  }

  /**
   * Get number of requests in current window
   */
  getCurrentCount(): number {
    this.cleanupOldTimestamps(Date.now())
    return this.requestTimestamps.length
  }

  /**
   * Get number of remaining requests before hitting effective limit
   */
  getRemainingCount(): number {
    return Math.max(0, this.getEffectiveLimit() - this.getCurrentCount())
  }

  /**
   * Check if we can make a request without waiting
   */
  canMakeRequest(): boolean {
    return this.getCurrentCount() < this.getEffectiveLimit()
  }

  /**
   * Calculate how long to wait before next request
   */
  getWaitTime(): number {
    const now = Date.now()
    this.cleanupOldTimestamps(now)

    const count = this.requestTimestamps.length
    const effectiveLimit = this.getEffectiveLimit()

    if (count < effectiveLimit) {
      return 0 // No wait needed
    }

    // Find oldest timestamp that would put us over limit
    const oldestTs = this.requestTimestamps[0]
    const waitMs = this.config.windowMs - (now - oldestTs) + 100 // +100ms buffer

    return Math.max(0, waitMs)
  }

  /**
   * Execute a function with rate limiting
   * Automatically waits if necessary to stay within limits
   *
   * @param fn - The async function to execute
   * @returns Promise resolving to the function's return value
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    const waitMs = this.getWaitTime()

    if (waitMs > 0) {
      console.log(
        `⏳ Rate limit protection: waiting ${Math.ceil(waitMs / 1000)}s ` +
        `(${this.getCurrentCount()}/${this.getEffectiveLimit()} requests in window)`
      )
      await this.sleep(waitMs)
    }

    // Execute the function
    const startTime = Date.now()
    try {
      const result = await fn()

      // Record successful request
      this.requestTimestamps.push(Date.now())

      return result
    } catch (error) {
      // Still record failed requests to stay accurate
      this.requestTimestamps.push(Date.now())
      throw error
    }
  }

  /**
   * Execute multiple functions with rate limiting and batch delays
   * Processes in batches with configurable delay between batches
   *
   * @param fns - Array of async functions to execute
   * @param batchSize - Number of requests to execute in parallel per batch
   * @param batchDelayMs - Delay between batches in milliseconds
   * @returns Promise resolving to array of results (or errors)
   */
  async executeBatch<T>(
    fns: Array<() => Promise<T>>,
    batchSize: number = 50,
    batchDelayMs: number = 1000
  ): Promise<Array<{ success: boolean; result?: T; error?: any }>> {
    const results: Array<{ success: boolean; result?: T; error?: any }> = []

    for (let i = 0; i < fns.length; i += batchSize) {
      const batch = fns.slice(i, i + batchSize)

      console.log(
        `Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(fns.length / batchSize)} ` +
        `(${batch.length} requests)`
      )

      // Execute batch in parallel with rate limiting
      const batchResults = await Promise.all(
        batch.map(async (fn) => {
          try {
            const result = await this.execute(fn)
            return { success: true, result }
          } catch (error) {
            return { success: false, error }
          }
        })
      )

      results.push(...batchResults)

      // Add delay between batches (except after last batch)
      if (i + batchSize < fns.length && batchDelayMs > 0) {
        console.log(`⏸️  Batch delay: waiting ${batchDelayMs}ms before next batch`)
        await this.sleep(batchDelayMs)
      }
    }

    return results
  }

  /**
   * Reset the rate limiter (clear all tracked requests)
   */
  reset(): void {
    this.requestTimestamps = []
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /**
   * Get rate limiter statistics
   */
  getStats() {
    this.cleanupOldTimestamps(Date.now())
    return {
      currentCount: this.requestTimestamps.length,
      effectiveLimit: this.getEffectiveLimit(),
      totalLimit: this.config.requestsPerWindow,
      remaining: this.getRemainingCount(),
      windowMs: this.config.windowMs,
      canMakeRequest: this.canMakeRequest(),
      waitTimeMs: this.getWaitTime()
    }
  }
}

// Singleton instance for global use
export const pipedreamRateLimiter = new RateLimiter()
