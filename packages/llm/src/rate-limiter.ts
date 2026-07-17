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
  const waiters: Array<() => void> = []
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
        waiters.shift()!()
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
    acquire(): Promise<void> {
      refill()
      if (admit()) {
        tokens -= 1
        return Promise.resolve()
      }
      return new Promise<void>((resolve) => {
        waiters.push(resolve)
        scheduleDrain()
      })
    },
    penalize(retryAfterMs?: number): void {
      rpm = Math.max(minRpm, Math.floor(rpm / 2))
      tokens = 0
      successStreak = 0
      if (retryAfterMs && retryAfterMs > 0) {
        pausedUntil = Date.now() + retryAfterMs
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
