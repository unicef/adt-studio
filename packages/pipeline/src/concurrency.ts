/**
 * Process items with bounded concurrency.
 */
export async function processWithConcurrency<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  if (!Number.isInteger(concurrency) || concurrency < 1) throw new Error("Concurrency must be a positive integer")
  let cursor = 0
  let failed = false
  let failure: unknown
  async function worker() {
    while (!failed && cursor < items.length) {
      const item = items[cursor++]
      try { await fn(item) }
      catch (error) { if (!failed) { failed = true; failure = error } }
    }
  }
  // A rejected page must not let callers close storage/release admission while
  // other admitted pages still use it. Stop new work and drain every writer.
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker))
  if (failed) throw failure
}

export interface Semaphore {
  /** Run `fn` once a slot is free. Queued callers wait instead of competing. */
  run<T>(fn: () => Promise<T>, signal?: AbortSignal): Promise<T>
  readonly limit: number
  readonly active: number
  readonly queued: number
}

/**
 * Counting semaphore for capping concurrent access to a shared resource
 * (e.g. a single Chromium instance) independently of caller-level concurrency.
 */
export function createSemaphore(limit: number): Semaphore {
  // A NaN limit would make `active < max` always false and queue every run forever.
  const max = Number.isFinite(limit) ? Math.max(1, Math.floor(limit)) : 1
  const waiters: Array<{
    grant: () => void
    reject: (reason: Error) => void
  }> = []
  let active = 0

  function abortError(signal: AbortSignal): Error {
    return signal.reason instanceof Error ? signal.reason : new Error("Operation aborted")
  }

  function acquire(signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) return Promise.reject(abortError(signal))
    if (active < max) {
      active++
      return Promise.resolve()
    }

    return new Promise<void>((resolve, reject) => {
      const waiter = {
        grant: () => {
          signal?.removeEventListener("abort", onAbort)
          active++
          resolve()
        },
        reject,
      }
      const onAbort = () => {
        const index = waiters.indexOf(waiter)
        if (index === -1) return
        waiters.splice(index, 1)
        reject(abortError(signal!))
      }
      signal?.addEventListener("abort", onAbort, { once: true })
      waiters.push(waiter)
    })
  }

  function release(): void {
    active--
    waiters.shift()?.grant()
  }

  return {
    get limit() {
      return max
    },
    get active() {
      return active
    },
    get queued() {
      return waiters.length
    },
    async run<T>(fn: () => Promise<T>, signal?: AbortSignal): Promise<T> {
      await acquire(signal)
      try {
        return await fn()
      } finally {
        release()
      }
    },
  }
}
