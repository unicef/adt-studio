export interface RateLimiter {
  acquire(): Promise<void>
}

/**
 * Token-bucket rate limiter. Starts with a full bucket of tokens equal to
 * requestsPerMinute. Each acquire() consumes one token. Tokens refill
 * continuously at requestsPerMinute/60000 tokens per millisecond. If no
 * tokens are available, acquire() waits until one refills.
 */
export function createRateLimiter(requestsPerMinute: number): RateLimiter {
  const refillRate = requestsPerMinute / 60_000 // tokens per ms
  let tokens = requestsPerMinute
  let lastRefill = Date.now()
  const waiters: Array<() => void> = []

  function refill() {
    const now = Date.now()
    const elapsed = now - lastRefill
    tokens = Math.min(requestsPerMinute, tokens + elapsed * refillRate)
    lastRefill = now
  }

  return {
    acquire(): Promise<void> {
      refill()

      if (tokens >= 1) {
        tokens -= 1
        return Promise.resolve()
      }

      // Wait for enough time for 1 token to refill
      return new Promise<void>((resolve) => {
        waiters.push(resolve)

        if (waiters.length === 1) {
          scheduleDrain()
        }
      })
    },
  }

  function scheduleDrain() {
    const msPerToken = 1 / refillRate
    setTimeout(() => {
      refill()
      while (waiters.length > 0 && tokens >= 1) {
        tokens -= 1
        waiters.shift()!()
      }
      if (waiters.length > 0) {
        scheduleDrain()
      }
    }, msPerToken)
  }
}
