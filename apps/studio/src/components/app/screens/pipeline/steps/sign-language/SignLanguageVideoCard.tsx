import { memo } from "react"
import { Loader2, Trash2, TriangleAlert } from "lucide-react"
import { useLingui } from "@lingui/react/macro"
import { getSignLanguageVideoUrl, type SignLanguageVideo } from "@/api/client"
import { cn } from "@/lib/utils"
import { SectionAssignmentCombobox } from "@/components/pipeline/stages/sign-language/components/SectionAssignmentCombobox"
import type { SectionEntry } from "@/components/pipeline/stages/sign-language/components/types"
import { RowAction, StepCard } from "../shared/ui"
import { formatSize } from "./formatSize"
import { VideoFrame } from "./VideoFrame"

export interface SignLanguageVideoCardProps {
  video: SignLanguageVideo
  label: string
  hex: string
  sections: SectionEntry[]
  orphan: boolean
  placed: boolean
  isAssigning: boolean
  isDeleting: boolean
  onAssign: (videoId: string, sectionId: string | null) => void
  onDelete: (videoId: string) => void
}

export const SignLanguageVideoCard = memo(function SignLanguageVideoCard({
  video,
  label,
  hex,
  sections,
  orphan,
  placed,
  isAssigning,
  isDeleting,
  onAssign,
  onDelete,
}: SignLanguageVideoCardProps) {
  const { t, i18n } = useLingui()

  return (
    <div
      data-video-card={video.videoId}
      aria-busy={isDeleting || undefined}
      className={cn(
        "transition-opacity duration-300 ease-out motion-reduce:transition-none",
        isDeleting && "pointer-events-none opacity-50",
      )}
    >
      <StepCard accent={hex} muted={!placed} mutedLabel={t`Not on a page yet`} className="h-full">
        <VideoFrame
          src={getSignLanguageVideoUrl(label, video.videoId)}
          name={video.originalName}
          hex={hex}
          badge={
            orphan ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-black/65 px-2 py-0.5 text-[10.5px] font-medium text-white backdrop-blur-sm">
                <TriangleAlert className="size-3" />
                {t`Its section was removed`}
              </span>
            ) : null
          }
        />

        <div className="flex h-6 items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium" title={video.originalName}>
            {video.originalName}
          </span>
          <span className="shrink-0 font-mono text-[10.5px] text-muted-foreground">{formatSize(video.sizeBytes, i18n.locale)}</span>
          <RowAction
            icon={isDeleting ? Loader2 : Trash2}
            tone="danger"
            disabled={isDeleting}
            label={t`Delete ${video.originalName}`}
            onClick={() => onDelete(video.videoId)}
          />
        </div>

        <div className="relative">
          <SectionAssignmentCombobox
            sections={sections}
            value={video.sectionId}
            accent={hex}
            disabled={isAssigning || isDeleting}
            placeholder={t`Choose a page…`}
            orphanLabel={t`Choose a new page…`}
            ariaLabel={t`Page for ${video.originalName}`}
            className={cn(
              isAssigning && "pr-8",
              !placed && "border-[color-mix(in_srgb,var(--combo-accent)_45%,transparent)] bg-[color-mix(in_srgb,var(--combo-accent)_6%,var(--background))]",
            )}
            onAssign={(sectionId) => onAssign(video.videoId, sectionId)}
          />
          {isAssigning && (
            <Loader2 className="pointer-events-none absolute top-1/2 right-8 size-3.5 -translate-y-1/2 animate-spin text-muted-foreground motion-reduce:animate-none" />
          )}
        </div>
      </StepCard>
    </div>
  )
})
