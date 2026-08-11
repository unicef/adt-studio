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
  run<T>(fn: () => Promise<T>): Promise<T>
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
  const waiters: Array<() => void> = []
  let active = 0

  function acquire(): Promise<void> {
    if (active < max) {
      active++
      return Promise.resolve()
    }
    return new Promise<void>((resolve) => {
      waiters.push(() => {
        active++
        resolve()
      })
    })
  }

  function release(): void {
    active--
    waiters.shift()?.()
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
    async run<T>(fn: () => Promise<T>): Promise<T> {
      await acquire()
      try {
        return await fn()
      } finally {
        release()
      }
    },
  }
}
