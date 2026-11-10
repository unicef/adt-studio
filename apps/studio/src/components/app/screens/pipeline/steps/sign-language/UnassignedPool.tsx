import { Loader2, Play, X } from "lucide-react"
import { useLingui } from "@lingui/react/macro"
import { getSignLanguageVideoUrl, type SignLanguageVideo } from "@/api/client"
import { SectionAssignmentCombobox } from "@/components/pipeline/stages/sign-language/components/SectionAssignmentCombobox"
import type { SectionEntry } from "@/components/pipeline/stages/sign-language/components/types"

export function UnassignedPool({
  label,
  hex,
  videos,
  sections,
  assigning,
  deletingId,
  onPlay,
  onAssign,
  onDelete,
}: {
  label: string
  hex: string
  videos: SignLanguageVideo[]
  sections: SectionEntry[]
  assigning: boolean
  deletingId: string | null
  onPlay: (video: SignLanguageVideo) => void
  onAssign: (videoId: string, sectionId: string | null) => void
  onDelete: (videoId: string) => void
}) {
  const { t } = useLingui()
  if (videos.length === 0) return null
  return (
    <div
      style={{ ["--pool-hex" as string]: hex }}
      className="flex flex-col gap-1.5 rounded-lg border border-[color-mix(in_srgb,var(--pool-hex)_28%,transparent)] bg-[color-mix(in_srgb,var(--pool-hex)_5%,var(--card))] p-2 animate-in fade-in duration-300 motion-reduce:animate-none"
    >
      <div className="flex items-center gap-1.5 px-1">
        <span className="text-[11.5px] font-semibold text-foreground">{t`Not on a page yet`}</span>
        <span className="rounded-full bg-[color-mix(in_srgb,var(--pool-hex)_14%,transparent)] px-1.5 font-mono text-[10px] leading-4 tabular-nums text-[var(--pool-hex)]">
          {videos.length}
        </span>
      </div>
      <ul className="flex flex-col gap-1">
        {videos.map((video) => (
          <li key={video.videoId} className="flex items-center gap-2 rounded-md border bg-card px-2 py-1.5">
            <button
              type="button"
              onClick={() => onPlay(video)}
              aria-label={t`Play ${video.originalName}`}
              className="group relative grid h-7 w-10 shrink-0 place-items-center overflow-hidden rounded bg-black transition-opacity hover:opacity-85"
            >
              <video src={getSignLanguageVideoUrl(label, video.videoId)} className="absolute inset-0 size-full object-cover" muted preload="metadata" />
              <Play className="relative size-3 fill-white text-white opacity-90" />
            </button>
            <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-foreground" title={video.originalName}>
              {video.originalName}
            </span>
            <SectionAssignmentCombobox
              sections={sections}
              value={null}
              accent={hex}
              disabled={assigning}
              placeholder={t`Choose a page…`}
              ariaLabel={t`Page for ${video.originalName}`}
              className="h-8 w-36"
              onAssign={(sectionId) => onAssign(video.videoId, sectionId)}
            />
            <button
              type="button"
              onClick={() => onDelete(video.videoId)}
              disabled={deletingId === video.videoId}
              aria-label={t`Delete ${video.originalName}`}
              className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
            >
              {deletingId === video.videoId ? <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" /> : <X className="size-3.5" />}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
