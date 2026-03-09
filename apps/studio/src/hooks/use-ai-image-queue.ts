import { useState, useRef, useCallback, createContext, useContext } from "react"
import { api } from "@/api/client"

export interface AiImageJobEntry {
  jobId: string
  bookLabel: string
  pageId: string
  sectionIndex: number
  targetImageId: string
  /** "replace" = swap existing image; "add" = insert new image into section */
  jobType: "replace" | "add"
  status: "pending" | "done" | "error"
  imageId?: string
  /** Generated image dimensions — used by the "add" apply path */
  width?: number
  height?: number
  /** Original target image dimensions — used by the "replace" apply path */
  originalWidth?: number
  originalHeight?: number
  error?: string
}

interface SubmitJobParams {
  bookLabel: string
  pageId: string
  sectionIndex: number
  targetImageId: string
  jobType: "replace" | "add"
  prompt: string
  referenceImageId?: string
  apiKey: string
}

interface AiImageQueue {
  jobs: AiImageJobEntry[]
  submitJob: (params: SubmitJobParams) => void
  clearJob: (jobId: string) => void
}

const AiImageQueueContext = createContext<AiImageQueue>({
  jobs: [],
  submitJob: () => {},
  clearJob: () => {},
})

export function useAiImageQueueContext() {
  return useContext(AiImageQueueContext)
}

export { AiImageQueueContext }

export function useAiImageQueue(bookLabel: string): AiImageQueue {
  const [jobs, setJobs] = useState<AiImageJobEntry[]>([])
  const intervalsRef = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map())

  const clearJob = useCallback((jobId: string) => {
    const interval = intervalsRef.current.get(jobId)
    if (interval !== undefined) {
      clearInterval(interval)
      intervalsRef.current.delete(jobId)
    }
    setJobs((prev) => prev.filter((j) => j.jobId !== jobId))
  }, [])

  const submitJob = useCallback(
    async (params: SubmitJobParams) => {
      const { pageId, sectionIndex, targetImageId, jobType, prompt, referenceImageId, apiKey } = params
      let jobId: string
      try {
        const res = await api.aiGenerateImageAsync(bookLabel, pageId, prompt, apiKey, targetImageId, referenceImageId)
        jobId = res.jobId
      } catch (err) {
        const entry: AiImageJobEntry = {
          jobId: crypto.randomUUID(),
          bookLabel,
          pageId,
          sectionIndex,
          targetImageId,
          jobType,
          status: "error",
          error: err instanceof Error ? err.message : "Failed to start image generation",
        }
        setJobs((prev) => [...prev, entry])
        return
      }

      const entry: AiImageJobEntry = {
        jobId,
        bookLabel,
        pageId,
        sectionIndex,
        targetImageId,
        jobType,
        status: "pending",
      }
      setJobs((prev) => [...prev, entry])

      const interval = setInterval(async () => {
        try {
          const job = await api.getAiImageJob(bookLabel, jobId)
          if (job.status === "done" || job.status === "error") {
            clearInterval(interval)
            intervalsRef.current.delete(jobId)
            setJobs((prev) =>
              prev.map((j) =>
                j.jobId === jobId
                  ? {
                      ...j,
                      status: job.status,
                      imageId: job.imageId,
                      width: job.width,
                      height: job.height,
                      originalWidth: job.originalWidth,
                      originalHeight: job.originalHeight,
                      error: job.error,
                    }
                  : j
              )
            )
          }
        } catch {
          clearInterval(interval)
          intervalsRef.current.delete(jobId)
          setJobs((prev) =>
            prev.map((j) =>
              j.jobId === jobId ? { ...j, status: "error", error: "Job expired or lost" } : j
            )
          )
        }
      }, 2000)

      intervalsRef.current.set(jobId, interval)
    },
    [bookLabel, clearJob]
  )

  return { jobs, submitJob, clearJob }
}
