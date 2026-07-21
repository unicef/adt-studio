import { describe, it, expect, vi, afterEach } from "vitest"
import { createRateLimiter, createAdaptiveRateLimiter } from "../rate-limiter.js"

describe("createRateLimiter", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it("allows immediate requests up to the bucket size", async () => {
    const limiter = createRateLimiter(3)
    // Should resolve immediately for first 3 calls
    await limiter.acquire()
    await limiter.acquire()
    await limiter.acquire()
  })

  it("delays requests when bucket is exhausted", async () => {
    vi.useFakeTimers()
    const limiter = createRateLimiter(2)

    // Drain the bucket
    await limiter.acquire()
    await limiter.acquire()

    // Third call should be delayed
    let resolved = false
    const promise = limiter.acquire().then(() => {
      resolved = true
    })

    expect(resolved).toBe(false)

    // Advance time enough for 1 token to refill (60000ms / 2 = 30000ms per token)
    await vi.advanceTimersByTimeAsync(30_000)

    await promise
    expect(resolved).toBe(true)
  })

  it("refills tokens over time", async () => {
    vi.useFakeTimers()
    const limiter = createRateLimiter(60) // 1 per second

    // Drain all 60 tokens
    for (let i = 0; i < 60; i++) {
      await limiter.acquire()
    }

    let resolved = false
    const promise = limiter.acquire().then(() => {
      resolved = true
    })

    expect(resolved).toBe(false)

    // 1 second should refill 1 token
    await vi.advanceTimersByTimeAsync(1_000)

    await promise
    expect(resolved).toBe(true)
  })

  it("queues multiple waiters in order", async () => {
    vi.useFakeTimers()
    const limiter = createRateLimiter(1) // 1 per minute

    // Drain the bucket
    await limiter.acquire()

    const order: number[] = []
    const p1 = limiter.acquire().then(() => order.push(1))
    const p2 = limiter.acquire().then(() => order.push(2))

    // Advance enough for 2 tokens (60s each)
    await vi.advanceTimersByTimeAsync(120_000)

    await Promise.all([p1, p2])
    expect(order).toEqual([1, 2])
  })

  it("rejects immediately when the signal is already aborted", async () => {
    const limiter = createRateLimiter(3)
    const controller = new AbortController()
    controller.abort()

    await expect(limiter.acquire(controller.signal)).rejects.toMatchObject({
      name: "AbortError",
    })
  })

  it("rejects queued waiters when the signal aborts and frees their slot", async () => {
    vi.useFakeTimers()
    const limiter = createRateLimiter(1) // 1 per minute

    // Drain the bucket so the next acquire queues
    await limiter.acquire()

    const controller = new AbortController()
    const aborted = limiter.acquire(controller.signal)
    const abortedResult = aborted.then(
      () => "resolved",
      (err: { name?: string }) => err?.name ?? "rejected"
    )

    controller.abort()
    expect(await abortedResult).toBe("AbortError")

    // The aborted waiter must not consume the next token: a later waiter
    // gets it as soon as one refills.
    let granted = false
    const next = limiter.acquire().then(() => {
      granted = true
    })
    await vi.advanceTimersByTimeAsync(60_000)
    await next
    expect(granted).toBe(true)
  })
})

describe("createAdaptiveRateLimiter", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it("halves the rate on penalize, never below the floor", () => {
    const limiter = createAdaptiveRateLimiter({ startRpm: 100, minRpm: 5, maxRpm: 100 })
    expect(limiter.currentRpm()).toBe(100)
    limiter.penalize()
    expect(limiter.currentRpm()).toBe(50)
    limiter.penalize()
    expect(limiter.currentRpm()).toBe(25)
    for (let i = 0; i < 10; i++) limiter.penalize()
    expect(limiter.currentRpm()).toBe(5)
  })

  it("raises the rate after enough rewards, capped at max", () => {
    const limiter = createAdaptiveRateLimiter({
      startRpm: 10,
      minRpm: 5,
      maxRpm: 100,
      rewardEvery: 3,
    })
    // increaseStep = floor(maxRpm / 10) = 10
    limiter.reward()
    limiter.reward()
    expect(limiter.currentRpm()).toBe(10) // not enough successes yet
    limiter.reward()
    expect(limiter.currentRpm()).toBe(20) // +10 after 3
    for (let i = 0; i < 100; i++) limiter.reward()
    expect(limiter.currentRpm()).toBe(100) // capped at max
  })

  it("admits an initial burst then throttles to the rate", async () => {
    vi.useFakeTimers()
    const limiter = createAdaptiveRateLimiter({
      startRpm: 60,
      minRpm: 5,
      maxRpm: 60,
      burst: 2,
    })

    // burst=2 → first two are immediate
    await limiter.acquire()
    await limiter.acquire()

    let resolved = false
    const promise = limiter.acquire().then(() => {
      resolved = true
    })
    expect(resolved).toBe(false)

    // 60 rpm → 1 token per second
    await vi.advanceTimersByTimeAsync(1_500)
    await promise
    expect(resolved).toBe(true)
  })

  it("pauses all acquisition for the retry window given to penalize", async () => {
    vi.useFakeTimers()
    const limiter = createAdaptiveRateLimiter({
      startRpm: 60,
      minRpm: 5,
      maxRpm: 60,
      burst: 5,
    })

    await limiter.acquire()
    limiter.penalize(5_000) // rate halves, no tokens admitted for 5s
    expect(limiter.currentRpm()).toBe(30)

    let resolved = false
    const promise = limiter.acquire().then(() => {
      resolved = true
    })

    await vi.advanceTimersByTimeAsync(4_000)
    expect(resolved).toBe(false) // still within the pause window

    await vi.advanceTimersByTimeAsync(6_000) // pause elapsed + one token refilled at 30 rpm
    await promise
    expect(resolved).toBe(true)
  })

  it("collapses a burst of 429s within the pause window into one back-off step", () => {
    vi.useFakeTimers()
    const limiter = createAdaptiveRateLimiter({ startRpm: 120, minRpm: 5, maxRpm: 120 })

    // A wave of concurrent 429s: the first backs off, the rest arrive while
    // still paused and must not compound the halving.
    limiter.penalize(5_000)
    expect(limiter.currentRpm()).toBe(60)
    limiter.penalize(5_000)
    limiter.penalize(3_000)
    limiter.penalize(5_000)
    expect(limiter.currentRpm()).toBe(60)

    // Once the pause elapses, a fresh 429 counts as a new congestion event.
    vi.advanceTimersByTime(5_001)
    limiter.penalize(5_000)
    expect(limiter.currentRpm()).toBe(30)
  })

  it("extends the pause window when a later 429 asks for longer", async () => {
    vi.useFakeTimers()
    const limiter = createAdaptiveRateLimiter({
      startRpm: 60,
      minRpm: 5,
      maxRpm: 60,
      burst: 5,
    })

    limiter.penalize(2_000)
    limiter.penalize(8_000) // arrives during the pause, asks for a longer window
    expect(limiter.currentRpm()).toBe(30) // one back-off step, not two

    let resolved = false
    const promise = limiter.acquire().then(() => {
      resolved = true
    })

    await vi.advanceTimersByTimeAsync(3_000) // past the first window, inside the extended one
    expect(resolved).toBe(false)

    await vi.advanceTimersByTimeAsync(8_000) // past the extended window + a token refilled at 30 rpm
    await promise
    expect(resolved).toBe(true)
  })

  it("rejects immediately when the signal is already aborted", async () => {
    const limiter = createAdaptiveRateLimiter({ startRpm: 3, minRpm: 3, maxRpm: 3 })
    const controller = new AbortController()
    controller.abort()

    await expect(limiter.acquire(controller.signal)).rejects.toMatchObject({
      name: "AbortError",
    })
  })

  it("rejects queued waiters when the signal aborts and frees their slot", async () => {
    vi.useFakeTimers()
    const limiter = createAdaptiveRateLimiter({
      startRpm: 2,
      minRpm: 2,
      maxRpm: 2,
      burst: 1,
    })

    // Drain the bucket so the next acquire queues.
    await limiter.acquire()

    const controller = new AbortController()
    const aborted = limiter.acquire(controller.signal)
    const abortedResult = aborted.then(
      () => "resolved",
      (err: { name?: string }) => err?.name ?? "rejected"
    )

    controller.abort()
    expect(await abortedResult).toBe("AbortError")

    // The aborted waiter must not consume the next token: a later waiter
    // gets it as soon as one refills.
    let granted = false
    const next = limiter.acquire().then(() => {
      granted = true
    })
    await vi.advanceTimersByTimeAsync(60_000)
    await next
    expect(granted).toBe(true)
  })
})
