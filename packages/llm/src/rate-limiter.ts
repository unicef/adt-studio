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

/**
 * An adaptive rate limiter that self-tunes its request rate in response to
 * feedback from the caller. Extends the plain {@link RateLimiter} contract with
 * `penalize()`/`reward()` so a caller can start optimistically at a documented
 * ceiling and let the limiter converge on whatever the account's real quota is.
 */
export interface AdaptiveRateLimiter extends RateLimiter {
  /**
   * Signal that a request was rejected for rate-limiting. Multiplicatively
   * lowers the effective rate (never below `minRpm`). When `retryAfterMs` is
   * provided, no request is admitted until that long has elapsed — so a single
   * 429 pauses every in-flight worker instead of each retrying independently.
   */
  penalize(retryAfterMs?: number): void
  /** Signal a successful request; gradually raises the rate back toward `maxRpm`. */
  reward(): void
  /** Current effective requests-per-minute (for logging and tests). */
  currentRpm(): number
}

export interface AdaptiveRateLimiterOptions {
  /** Rate to start at. For "auto" callers this is `maxRpm` — start high, back off. */
  startRpm: number
  /** Floor the rate can drop to under sustained throttling. */
  minRpm: number
  /** Ceiling the rate can recover to. */
  maxRpm: number
  /** Max tokens that can accumulate for an initial/idle burst. Default `min(startRpm, 8)`. */
  burst?: number
  /** Consecutive successes between upward probes. Default 5. */
  rewardEvery?: number
}

/**
 * Adaptive token-bucket rate limiter using AIMD (additive-increase,
 * multiplicative-decrease), the same congestion-control shape TCP uses:
 *   - `penalize()` halves the rate (down to `minRpm`) — fast back-off when throttled.
 *   - `reward()` nudges the rate up by a fixed step after `rewardEvery` consecutive
 *     successes (up to `maxRpm`) — slow probing back toward full speed.
 *
 * The bucket starts nearly empty (a small `burst`) even when `startRpm` is high,
 * so an optimistic start doesn't fire a thundering herd before the first 429
 * lands and lowers the rate.
 */
export function createAdaptiveRateLimiter(
  options: AdaptiveRateLimiterOptions
): AdaptiveRateLimiter {
  const minRpm = Math.max(1, Math.floor(options.minRpm))
  const maxRpm = Math.max(minRpm, Math.floor(options.maxRpm))
  const rewardEvery = Math.max(1, Math.floor(options.rewardEvery ?? 5))
  const increaseStep = Math.max(1, Math.floor(maxRpm / 10))

  let rpm = Math.min(maxRpm, Math.max(minRpm, Math.floor(options.startRpm)))
  const burst = Math.max(1, Math.min(options.burst ?? Math.min(rpm, 8), maxRpm))
  let tokens = Math.min(burst, rpm)
  let lastRefill = Date.now()
  let pausedUntil = 0
  let successStreak = 0
  const waiters: Array<{ grant: () => void }> = []
  let draining = false

  function capacity(): number {
    return Math.max(1, Math.min(burst, rpm))
  }

  function refill(): void {
    const now = Date.now()
    // Accumulate only after any active pause has elapsed.
    const start = Math.max(lastRefill, pausedUntil)
    const elapsed = now - start
    if (elapsed > 0) {
      tokens = Math.min(capacity(), tokens + (elapsed * rpm) / 60_000)
    }
    lastRefill = now
  }

  function admit(): boolean {
    return tokens >= 1 && Date.now() >= pausedUntil
  }

  function scheduleDrain(): void {
    if (draining) return
    draining = true
    const tick = (): void => {
      refill()
      while (waiters.length > 0 && admit()) {
        tokens -= 1
        waiters.shift()!.grant()
      }
      if (waiters.length > 0) {
        const waitForPause = Math.max(0, pausedUntil - Date.now())
        const msPerToken = 60_000 / rpm
        setTimeout(tick, Math.max(5, waitForPause, msPerToken))
      } else {
        draining = false
      }
    }
    setTimeout(tick, 5)
  }

  return {
    acquire(signal?: AbortSignal): Promise<void> {
      if (signal?.aborted) {
        return Promise.reject(signal.reason)
      }

      refill()
      if (admit()) {
        tokens -= 1
        return Promise.resolve()
      }

      // No token available: park until one refills. Honor the abort signal so
      // cancelled work never sits in the queue (mirrors createRateLimiter).
      return new Promise<void>((resolve, reject) => {
        const waiter = {
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
    penalize(retryAfterMs?: number): void {
      const now = Date.now()
      // Collapse a burst of concurrent 429s from the same wave into a single
      // back-off step instead of halving once per in-flight request. A 429 that
      // arrives while we're still paused belongs to the wave that already
      // triggered the current back-off, so just (re)extend the pause window.
      if (now < pausedUntil) {
        if (retryAfterMs && retryAfterMs > 0) {
          pausedUntil = Math.max(pausedUntil, now + retryAfterMs)
        }
        return
      }
      rpm = Math.max(minRpm, Math.floor(rpm / 2))
      tokens = 0
      successStreak = 0
      if (retryAfterMs && retryAfterMs > 0) {
        pausedUntil = now + retryAfterMs
      }
    },
    reward(): void {
      if (rpm >= maxRpm) return
      successStreak += 1
      if (successStreak >= rewardEvery) {
        successStreak = 0
        rpm = Math.min(maxRpm, rpm + increaseStep)
      }
    },
    currentRpm(): number {
      return rpm
    },
  }
}
