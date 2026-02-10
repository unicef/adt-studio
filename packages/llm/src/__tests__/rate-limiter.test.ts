import { describe, it, expect, vi, afterEach } from "vitest"
import { createRateLimiter } from "../rate-limiter.js"

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
})
