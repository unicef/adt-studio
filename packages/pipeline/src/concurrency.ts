/**
 * Process items with bounded concurrency.
 */
export async function processWithConcurrency<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  const executing = new Set<Promise<void>>()
  for (const item of items) {
    const p = fn(item).finally(() => {
      executing.delete(p)
    })
    executing.add(p)
    if (executing.size >= concurrency) {
      await Promise.race(executing)
    }
  }
  await Promise.all(executing)
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
  const max = Math.max(1, Math.floor(limit))
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
