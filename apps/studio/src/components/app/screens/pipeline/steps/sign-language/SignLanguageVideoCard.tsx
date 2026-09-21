import { memo } from "react"
import { Loader2, Trash2 } from "lucide-react"
import { Trans, useLingui } from "@lingui/react/macro"
import { getSignLanguageVideoUrl, type SignLanguageVideo } from "@/api/client"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { tint } from "@/components/app/screens/pipeline/shared/plugins"
import type { SectionEntry } from "@/components/pipeline/stages/sign-language/components/types"
import { RowAction, StepCard } from "../shared/ui"

/* eslint-disable-next-line lingui/no-unlocalized-strings -- Radix Select has no "empty" value, so unassigned needs a sentinel of its own. */
export const UNASSIGNED = "__unassigned__"

function formatSize(bytes: number, locale: string): string {
  const [value, unit] =
    bytes < 1024
      ? [bytes, "byte" as const]
      : bytes < 1024 * 1024
        ? [bytes / 1024, "kilobyte" as const]
        : [bytes / (1024 * 1024), "megabyte" as const]
  return new Intl.NumberFormat(locale, {
    style: "unit",
    unit,
    unitDisplay: "short",
    maximumFractionDigits: unit === "byte" ? 0 : 1,
  }).format(value)
}

export interface SignLanguageVideoCardProps {
  video: SignLanguageVideo
  label: string
  hex: string
  sections: SectionEntry[]
  /** True while this video's assignment is being saved. */
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
  isAssigning,
  isDeleting,
  onAssign,
  onDelete,
}: SignLanguageVideoCardProps) {
  const { t, i18n } = useLingui()

  const assigned = video.sectionId
  // A video can point at a section the storyboard no longer has (re-run, pruned
  // section). Listing that id keeps the Select showing where the video actually
  // is instead of falling back to a blank trigger.
  const isOrphan = !!assigned && !sections.some((section) => section.sectionId === assigned)

  return (
    <StepCard accent={hex} className={assigned ? undefined : "opacity-60"}>
      {/* Fixed 16:9 frame so a grid of clips lines up regardless of what was
          filmed. `object-contain` fits the whole frame inside it, and the black
          background shows through as bars — portrait phone footage, which is
          most of what gets uploaded here, is pillarboxed rather than cropped. */}
      <video
        controls
        preload="metadata"
        className="aspect-video w-full rounded-lg border bg-black object-contain"
        src={getSignLanguageVideoUrl(label, video.videoId)}
      >
        <Trans>Your browser cannot play this video.</Trans>
      </video>

      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium" title={video.originalName}>
          {video.originalName}
        </span>
        <RowAction
          icon={isDeleting ? Loader2 : Trash2}
          tone="danger"
          disabled={isDeleting}
          label={t`Delete ${video.originalName}`}
          onClick={() => onDelete(video.videoId)}
        />
      </div>

      <div className="flex items-center gap-2">
        <Select
          value={assigned ?? UNASSIGNED}
          disabled={isAssigning}
          onValueChange={(value) => onAssign(video.videoId, value === UNASSIGNED ? null : value)}
        >
          <SelectTrigger
            className="h-7 flex-1 text-[11.5px]"
            aria-label={t`Page for ${video.originalName}`}
          >
            <SelectValue placeholder={t`Choose a page…`} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={UNASSIGNED}>{t`Unassigned`}</SelectItem>
            {isOrphan ? (
              <SelectItem value={assigned}>{t`${assigned} (section missing)`}</SelectItem>
            ) : null}
            {sections.map((section) => (
              <SelectItem key={section.sectionId} value={section.sectionId}>
                {section.sectionLabel}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {isAssigning ? (
          <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
        ) : null}
      </div>

      <div className="flex items-center gap-2 font-mono text-[10px] text-muted-foreground">
        <span>{formatSize(video.sizeBytes, i18n.locale)}</span>
        {assigned ? (
          <span
            className="truncate rounded px-1.5 py-0.5"
            style={{ background: tint(hex, 0.12), color: hex }}
          >
            {assigned}
          </span>
        ) : (
          <span className="rounded bg-muted px-1.5 py-0.5">
            <Trans>unassigned</Trans>
          </span>
        )}
      </div>
    </StepCard>
  )
})
