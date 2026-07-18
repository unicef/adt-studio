export interface RateLimiter {
  /** Waits for a token. Rejects with `signal.reason` if the signal aborts
   *  first (or is already aborted), so cancelled work never sits in the queue. */
  acquire(signal?: AbortSignal): Promise<void>
}

interface Waiter {
  grant: () => void
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
  const waiters: Waiter[] = []
  let drainScheduled = false

  function refill() {
    const now = Date.now()
    const elapsed = now - lastRefill
    tokens = Math.min(requestsPerMinute, tokens + elapsed * refillRate)
    lastRefill = now
  }

  return {
    acquire(signal?: AbortSignal): Promise<void> {
      if (signal?.aborted) {
        return Promise.reject(signal.reason)
      }

      refill()

      if (tokens >= 1) {
        tokens -= 1
        return Promise.resolve()
      }

      // Wait for enough time for 1 token to refill
      return new Promise<void>((resolve, reject) => {
        const waiter: Waiter = {
          grant: () => {
            signal?.removeEventListener("abort", onAbort)
            resolve()
          },
        }
        const onAbort = () => {
          const index = waiters.indexOf(waiter)
          if (index !== -1) waiters.splice(index, 1)
          reject(signal?.reason)
        }
        signal?.addEventListener("abort", onAbort, { once: true })
        waiters.push(waiter)
        scheduleDrain()
      })
    },
  }

  function scheduleDrain() {
    if (drainScheduled) return
    drainScheduled = true
    const msPerToken = 1 / refillRate
    setTimeout(() => {
      drainScheduled = false
      refill()
      while (waiters.length > 0 && tokens >= 1) {
        tokens -= 1
        waiters.shift()!.grant()
      }
      if (waiters.length > 0) {
        scheduleDrain()
      }
    }, msPerToken)
  }
}
