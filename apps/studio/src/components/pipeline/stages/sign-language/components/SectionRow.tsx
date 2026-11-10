import type { ReactNode } from "react"
import { Loader2, Play, Plus, Trash2, X } from "lucide-react"
import { Trans, useLingui } from "@lingui/react/macro"
import { getSignLanguageVideoUrl } from "@/api/client"
import type { SignLanguageVideo } from "@/api/client"
import { cn } from "@/lib/utils"

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
  accent,
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
  accent?: string
}) {
  const { t } = useLingui()

  return (
    <div
      style={accent ? { ["--row-accent" as string]: accent } : undefined}
      className={cn(
        "flex items-center gap-2 px-2.5 py-2 transition-colors",
        accent ? "bg-card hover:bg-muted/50" : "bg-white hover:bg-[#fafafa]",
      )}
    >
      <span className="flex min-w-0 flex-1 items-baseline gap-1.5">
        <span className={cn("truncate text-[12.5px] font-medium", accent ? "text-foreground" : "text-[#0a0a0a]")}>
          {label}
        </span>
        {/* Whitespace between flex items is not rendered, so this costs no
            layout but keeps the accessible name from running together. */}
        {" "}
        <span className={cn("shrink-0 font-mono text-[10px]", accent ? "text-muted-foreground" : "text-[#a3a3a3]")}>
          {sectionId}
        </span>
      </span>

      {video ? (
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onPlay(video)}
            className={cn(
              "group flex items-center gap-1.5 rounded-md border px-2 py-1 transition-colors",
              accent
                ? "border-[color-mix(in_srgb,var(--row-accent)_30%,transparent)] bg-[color-mix(in_srgb,var(--row-accent)_8%,transparent)] hover:border-[color-mix(in_srgb,var(--row-accent)_50%,transparent)] hover:bg-[color-mix(in_srgb,var(--row-accent)_14%,transparent)]"
                : "border-cyan-200 bg-cyan-50 hover:border-cyan-300 hover:bg-cyan-100",
            )}
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
            <span className={cn("max-w-[90px] truncate text-[11px] font-medium", accent ? "text-foreground" : "text-cyan-800")}>
              {video.originalName}
            </span>
            <Play
              className={cn("h-2.5 w-2.5 shrink-0", accent ? "text-[var(--row-accent)]" : "text-cyan-600")}
              strokeWidth={2.5}
              aria-hidden
            />
          </button>
          <button
            type="button"
            onClick={() => onUnassign(video.videoId)}
            aria-label={t`Unassign video`}
            className={cn(
              "flex h-6 w-6 items-center justify-center rounded transition-colors",
              accent ? "text-muted-foreground hover:bg-muted hover:text-foreground" : "text-[#a3a3a3] hover:bg-amber-50 hover:text-amber-600",
            )}
          >
            <X className="h-3 w-3" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => onDelete(video.videoId)}
            disabled={pendingDeleteId === video.videoId}
            aria-label={t`Delete video`}
            className={cn(
              "flex h-6 w-6 items-center justify-center rounded transition-colors disabled:opacity-50",
              accent ? "text-muted-foreground hover:bg-destructive/10 hover:text-destructive" : "text-[#a3a3a3] hover:bg-rose-50 hover:text-rose-600",
            )}
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
          className={cn(
            "inline-flex items-center gap-1 rounded-md border border-dashed px-2.5 py-1 text-[11px] font-medium transition-colors disabled:opacity-50",
            accent
              ? "border-border bg-muted/40 text-muted-foreground hover:border-[color-mix(in_srgb,var(--row-accent)_50%,transparent)] hover:bg-[color-mix(in_srgb,var(--row-accent)_8%,transparent)] hover:text-[var(--row-accent)]"
              : "border-[#d4d4d4] bg-[#fafafa] text-[#737373] hover:border-cyan-300 hover:bg-cyan-50 hover:text-cyan-700",
          )}
        >
          <Plus className="h-3 w-3" strokeWidth={2.5} aria-hidden />
          <Trans>Add video</Trans>
        </button>
      )}
    </div>
  )
}
