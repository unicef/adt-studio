import { useCallback, useMemo, useRef, useState } from "react"
import { useLingui } from "@lingui/react/macro"
import { useAssignSignLanguageVideo, useUploadSignLanguageVideo } from "@/hooks/use-sign-language-videos"
import type { SignLanguageVideo } from "@/api/client"

export const VIDEO_ACCEPT = "video/mp4,video/webm,.mp4,.webm"

const VIDEO_TYPES = new Set(["video/mp4", "video/webm"])
const VIDEO_EXTENSION = /\.(mp4|webm)$/i

export type PendingState = "queued" | "uploading" | "failed"

export interface PendingUpload {
  id: string
  name: string
  sizeBytes: number
  target: string | null
  state: PendingState
  error: string | null
  retryable: boolean
  videoId: string | null
}

interface QueuedUpload {
  id: string
  file: File
  target: string | null
  videoId: string | null
}

function isVideoFile(file: File): boolean {
  if (VIDEO_TYPES.has(file.type)) return true
  return file.type === "" && VIDEO_EXTENSION.test(file.name)
}

export interface VideoUploads {
  pending: PendingUpload[]
  busy: boolean
  uploadingTarget: (sectionId: string) => boolean
  add: (files: File[], target: string | null) => void
  retry: (id: string) => void
  dismiss: (id: string) => void
}

export function useVideoUploads(label: string, videos: SignLanguageVideo[]): VideoUploads {
  const { t } = useLingui()
  const upload = useUploadSignLanguageVideo(label)
  const assign = useAssignSignLanguageVideo(label)
  const [items, setItems] = useState<PendingUpload[]>([])
  const files = useRef(new Map<string, QueuedUpload>())
  const queue = useRef<QueuedUpload[]>([])
  const running = useRef(false)
  const counter = useRef(0)

  const patch = useCallback((id: string, next: Partial<PendingUpload>) => {
    setItems((list) => list.map((item) => (item.id === id ? { ...item, ...next } : item)))
  }, [])

  const drain = useCallback(async () => {
    if (running.current) return
    running.current = true
    while (queue.current.length > 0) {
      const job = queue.current.shift()
      if (!job) break
      patch(job.id, { state: "uploading", error: null })
      try {
        if (!job.videoId) {
          const data = await upload.mutateAsync(job.file)
          job.videoId = data.videoId
          patch(job.id, { videoId: data.videoId })
        }
        if (job.target) await assign.mutateAsync({ videoId: job.videoId, sectionId: job.target })
        files.current.delete(job.id)
      } catch (error) {
        patch(job.id, { state: "failed", error: error instanceof Error ? error.message : String(error), retryable: true })
      }
    }
    running.current = false
  }, [upload, assign, patch])

  const add = useCallback(
    (picked: File[], target: string | null) => {
      const list = target ? picked.slice(0, 1) : picked
      const next: PendingUpload[] = []
      for (const file of list) {
        counter.current += 1
        const id = `upload-${counter.current}`
        const ok = isVideoFile(file)
        next.push({
          id,
          name: file.name,
          sizeBytes: file.size,
          target,
          state: ok ? "queued" : "failed",
          error: ok ? null : t`Only mp4 and webm videos can be added.`,
          retryable: false,
          videoId: null,
        })
        if (ok) {
          const job: QueuedUpload = { id, file, target, videoId: null }
          files.current.set(id, job)
          queue.current.push(job)
        }
      }
      setItems((current) => [...current, ...next])
      void drain()
    },
    [drain, t],
  )

  const retry = useCallback(
    (id: string) => {
      const job = files.current.get(id)
      if (!job) return
      patch(id, { state: "queued", error: null })
      queue.current.push(job)
      void drain()
    },
    [drain, patch],
  )

  const dismiss = useCallback((id: string) => {
    files.current.delete(id)
    setItems((list) => list.filter((item) => item.id !== id))
  }, [])

  const known = useMemo(() => new Set(videos.map((video) => video.videoId)), [videos])
  const pending = useMemo(
    () => items.filter((item) => !(item.videoId && known.has(item.videoId) && item.state !== "failed")),
    [items, known],
  )
  const busy = pending.some((item) => item.state !== "failed")
  const uploadingTarget = useCallback(
    (sectionId: string) => pending.some((item) => item.target === sectionId && item.state !== "failed"),
    [pending],
  )

  return { pending, busy, uploadingTarget, add, retry, dismiss }
}
