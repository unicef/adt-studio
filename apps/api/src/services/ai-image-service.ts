// In-memory job store for async AI image generation.
// Jobs are short-lived (seconds to minutes) and ephemeral — no DB persistence needed.

export interface AiImageJob {
  jobId: string
  bookLabel: string
  pageId: string
  status: "pending" | "done" | "error"
  imageId?: string
  width?: number
  height?: number
  originalWidth?: number
  originalHeight?: number
  error?: string
  createdAt: number
}

const jobs = new Map<string, AiImageJob>()

const TEN_MINUTES = 10 * 60 * 1000

export function createJob(bookLabel: string, pageId: string): string {
  const jobId = crypto.randomUUID()
  jobs.set(jobId, { jobId, bookLabel, pageId, status: "pending", createdAt: Date.now() })
  return jobId
}

export function updateJob(
  jobId: string,
  updates: Partial<Pick<AiImageJob, "status" | "imageId" | "width" | "height" | "originalWidth" | "originalHeight" | "error">>
): void {
  const job = jobs.get(jobId)
  if (job) Object.assign(job, updates)
}

export function getJob(jobId: string): AiImageJob | undefined {
  return jobs.get(jobId)
}

/** Lazily remove jobs older than 10 minutes. Call on each poll to avoid unbounded growth. */
export function cleanupOldJobs(): void {
  const now = Date.now()
  for (const [jobId, job] of jobs) {
    if (now - job.createdAt > TEN_MINUTES) jobs.delete(jobId)
  }
}
