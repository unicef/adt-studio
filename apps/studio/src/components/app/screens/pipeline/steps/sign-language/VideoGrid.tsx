import type { SignLanguageVideo } from "@/api/client"
import { PendingUploadCard } from "./PendingUploadCard"
import { SignLanguageVideoCard } from "./SignLanguageVideoCard"
import type { SignLanguageModel } from "./useSignLanguageModel"
import type { PendingUpload } from "./useVideoUploads"

export const VIDEO_GRID = "grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3.5"

export function VideoGrid({
  label,
  hex,
  model,
  videos,
  pending,
  assigningId,
  deletingId,
  onAssign,
  onDelete,
  onRetry,
  onDismiss,
}: {
  label: string
  hex: string
  model: SignLanguageModel
  videos: SignLanguageVideo[]
  pending: PendingUpload[]
  assigningId: string | null
  deletingId: string | null
  onAssign: (videoId: string, sectionId: string | null) => void
  onDelete: (videoId: string) => void
  onRetry: (id: string) => void
  onDismiss: (id: string) => void
}) {
  return (
    <div className={VIDEO_GRID}>
      {videos.map((video) => (
        <SignLanguageVideoCard
          key={video.videoId}
          video={video}
          label={label}
          hex={hex}
          sections={model.sections}
          orphan={model.isOrphan(video)}
          placed={model.pageOf(video) !== null}
          isAssigning={assigningId === video.videoId}
          isDeleting={deletingId === video.videoId}
          onAssign={onAssign}
          onDelete={onDelete}
        />
      ))}
      {pending.map((item) => (
        <PendingUploadCard
          key={item.id}
          item={item}
          hex={hex}
          target={item.target ? (model.sectionById.get(item.target) ?? null) : null}
          onRetry={onRetry}
          onDismiss={onDismiss}
        />
      ))}
    </div>
  )
}
