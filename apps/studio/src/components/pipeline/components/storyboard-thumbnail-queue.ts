/** Transient UI work only: URLs and TanStack Query still own image identity/cache. */
export function createStoryboardThumbnailQueue(limit = 2) {
  const jobs = new Set<{ priority: number; active: boolean; start: (finish: () => void) => void }>()
  let scope: object | undefined
  let paused = true
  let scheduled = false
  function pump() {
    if (scheduled) return
    scheduled = true
    queueMicrotask(() => {
      scheduled = false
      if (paused) return
      let capacity = limit - [...jobs].filter(job => job.active).length
      for (const job of [...jobs].filter(job => !job.active).sort((a, b) => a.priority - b.priority)) {
        if (capacity-- <= 0) break
        job.active = true
        job.start(() => { jobs.delete(job); pump() })
      }
    })
  }
  return {
    setScope(next: object, waitForPreview: boolean) { scope = next; paused = waitForPreview; pump() },
    ready(completed: object) { if (completed === scope) { paused = false; pump() } },
    enqueue(priority: number, start: (finish: () => void) => void) {
      const job = { priority, start, active: false }
      jobs.add(job)
      pump()
      return {
        cancel() { jobs.delete(job); pump() },
        prioritize(next: number) { job.priority = next; pump() },
      }
    },
  }
}
