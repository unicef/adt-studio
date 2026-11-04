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
