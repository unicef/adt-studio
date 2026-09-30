import type { ReactNode } from "react"
import { Loader2, Play, Plus, Trash2, X } from "lucide-react"
import { Trans, useLingui } from "@lingui/react/macro"
import { getSignLanguageVideoUrl } from "@/api/client"
import type { SignLanguageVideo } from "@/api/client"

export function SectionRow({
  bookLabel,
  label,
  sectionId,
  video,
  onUpload,
  onUnassign,
  onDelete,
  onPlay,
  uploading,
  pendingDeleteId,
}: {
  bookLabel: string
  label: ReactNode
  /** Shown beside the label so a row names the section a video is pinned to,
   *  not just its position on the page. */
  sectionId: string
  video: SignLanguageVideo | null
  onUpload: () => void
  onUnassign: (videoId: string) => void
  onDelete: (videoId: string) => void
  onPlay: (video: SignLanguageVideo) => void
  uploading: boolean
  pendingDeleteId: string | null
}) {
  const { t } = useLingui()

  return (
    <div className="flex items-center gap-2 bg-white px-2.5 py-2 transition-colors hover:bg-[#fafafa]">
      <span className="flex min-w-0 flex-1 items-baseline gap-1.5">
        <span className="truncate text-[12.5px] font-medium text-[#0a0a0a]">
          {label}
        </span>
        {/* Whitespace between flex items is not rendered, so this costs no
            layout but keeps the accessible name from running together. */}
        {" "}
        <span className="shrink-0 font-mono text-[10px] text-[#a3a3a3]">
          {sectionId}
        </span>
      </span>

      {video ? (
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onPlay(video)}
            className="group flex items-center gap-1.5 rounded-md border border-cyan-200 bg-cyan-50 px-2 py-1 transition-colors hover:border-cyan-300 hover:bg-cyan-100"
            title={video.originalName}
          >
            <span className="flex h-5 w-7 shrink-0 items-center justify-center overflow-hidden rounded bg-black/90">
              <video
                src={getSignLanguageVideoUrl(bookLabel, video.videoId)}
                className="h-full w-full object-cover"
                muted
                preload="metadata"
              />
            </span>
            <span className="max-w-[90px] truncate text-[11px] font-medium text-cyan-800">
              {video.originalName}
            </span>
            <Play
              className="h-2.5 w-2.5 shrink-0 text-cyan-600"
              strokeWidth={2.5}
              aria-hidden
            />
          </button>
          <button
            type="button"
            onClick={() => onUnassign(video.videoId)}
            aria-label={t`Unassign video`}
            className="flex h-6 w-6 items-center justify-center rounded text-[#a3a3a3] transition-colors hover:bg-amber-50 hover:text-amber-600"
          >
            <X className="h-3 w-3" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => onDelete(video.videoId)}
            disabled={pendingDeleteId === video.videoId}
            aria-label={t`Delete video`}
            className="flex h-6 w-6 items-center justify-center rounded text-[#a3a3a3] transition-colors hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
          >
            {pendingDeleteId === video.videoId ? (
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
            ) : (
              <Trash2 className="h-3 w-3" aria-hidden />
            )}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={onUpload}
          disabled={uploading}
          className="inline-flex items-center gap-1 rounded-md border border-dashed border-[#d4d4d4] bg-[#fafafa] px-2.5 py-1 text-[11px] font-medium text-[#737373] transition-colors hover:border-cyan-300 hover:bg-cyan-50 hover:text-cyan-700 disabled:opacity-50"
        >
          <Plus className="h-3 w-3" strokeWidth={2.5} aria-hidden />
          <Trans>Add video</Trans>
        </button>
      )}
    </div>
  )
}
