import { memo, useState, type ReactNode } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { Crop, EyeOff, ImageOff, Loader2, RotateCcw, Scissors } from "lucide-react"
import { cn } from "@/lib/utils"
import { extractedImageUrl } from "../useExtractImages"
import { humanReason } from "./humanReason"
import { REASON_ICON } from "./reasonIcon"
import { imageDetailLine, imageDetailTooltip, imagePositionText } from "./imageDetails"
import type { PageImageEntry } from "./usePageDetailData"

const ICON_BUTTON = cn(
  "grid size-7 place-items-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50",
  "outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--chrome-hex)_45%,transparent)]",
)

const BRING_BACK = cn(
  "flex h-7 shrink-0 items-center gap-1 rounded-md border bg-card px-2 text-[11.5px] font-semibold text-foreground transition-colors duration-150 hover:bg-muted",
  "outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--chrome-hex)_45%,transparent)]",
)

function IconAction({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={label} aria-label={label} className={ICON_BUTTON}>
      {children}
    </button>
  )
}

export const PageImageItem = memo(function PageImageItem({
  label,
  entry,
  cacheKey,
  onHover,
  segmenting,
  showRecrop,
  showSegment,
  onTogglePrune,
  onRecrop,
  onSegment,
}: {
  label: string
  entry: PageImageEntry
  cacheKey: number
  onHover: (imageId: string | null) => void
  segmenting: boolean
  showRecrop: boolean
  showSegment: boolean
  onTogglePrune: (imageId: string) => void
  onRecrop: (imageId: string) => void
  onSegment: (imageId: string) => void
}) {
  const { t, i18n } = useLingui()
  const [failed, setFailed] = useState(false)
  const reason = humanReason(entry.reason)
  const reasonText = typeof reason.label === "string" ? reason.label : i18n._(reason.label)
  const explain = reason.explain ? i18n._(reason.explain) : null
  const pageElements = reason.kind === "page-elements"
  const guardKept = !entry.isPruned && reason.kind === "guard-kept"
  const ReasonIcon = REASON_ICON[reason.kind]
  const size = entry.width && entry.height ? `${entry.width} × ${entry.height}` : null
  const position = imagePositionText(i18n, entry)
  const editActions = (
    <>
      {showRecrop && (
        <IconAction label={t`Recrop from page`} onClick={() => onRecrop(entry.imageId)}>
          <Crop className="size-3.5" />
        </IconAction>
      )}
      {showSegment && (
        <IconAction label={segmenting ? t`Segmenting…` : t`Segment image`} onClick={() => onSegment(entry.imageId)} disabled={segmenting}>
          {segmenting ? <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" /> : <Scissors className="size-3.5" />}
        </IconAction>
      )}
    </>
  )

  return (
    <div
      onMouseEnter={() => onHover(entry.imageId)}
      onMouseLeave={() => onHover(null)}
      title={imageDetailTooltip(i18n, entry)}
      className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 rounded-lg bg-[color-mix(in_srgb,var(--chrome-hex)_10%,transparent)] px-2 py-1.5"
    >
      <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-md bg-[var(--chrome-hex)] px-1 font-mono text-[10.5px] font-semibold tabular-nums text-white">
        {entry.number}
      </span>
      <span className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-md border bg-muted/40">
        {failed ? (
          <ImageOff className="size-4 text-muted-foreground/50" />
        ) : (
          <img
            src={extractedImageUrl(label, entry.imageId, cacheKey)}
            alt={t`Image ${entry.number}`}
            loading="lazy"
            onError={() => setFailed(true)}
            className={cn("max-h-full max-w-full object-contain", entry.isPruned && "opacity-60 grayscale")}
          />
        )}
      </span>
      <span className="flex min-w-[150px] flex-1 flex-col">
        {entry.isPruned ? (
          <>
            <span
              className={cn("flex items-center gap-1 text-[12px] leading-snug font-medium", pageElements ? "text-[var(--chrome-hex)]" : "text-foreground")}
              title={reason.raw ?? undefined}
            >
              <ReasonIcon className="size-3 shrink-0" aria-hidden />
              <span className="line-clamp-2">{reasonText}</span>
            </span>
            {explain && <span className="text-[11px] leading-snug text-muted-foreground">{explain}</span>}
            {reason.detail && (
              <span className="line-clamp-2 text-[11px] leading-snug text-muted-foreground/80 italic" title={reason.detail}>
                <Trans>AI: {reason.detail}</Trans>
              </span>
            )}
          </>
        ) : (
          <>
            <span className="text-[12px] font-medium text-foreground">
              <Trans>Image {entry.number}</Trans>
            </span>
            {guardKept && (
              <span className="flex items-center gap-1 text-[11px] leading-snug text-muted-foreground" title={explain ?? undefined}>
                <ReasonIcon className="size-3 shrink-0" aria-hidden />
                {reasonText}
              </span>
            )}
          </>
        )}
        <span className="truncate font-mono text-[10.5px] text-muted-foreground/90">{imageDetailLine(entry)}</span>
        {position && (
          <span className="truncate font-mono text-[10.5px] text-muted-foreground/80">
            {position}
          </span>
        )}
      </span>
      {entry.isPruned ? (
        <span className="ml-auto flex items-center gap-0.5">
          {editActions}
          <button type="button" onClick={() => onTogglePrune(entry.imageId)} className={cn(BRING_BACK, "ml-1")}>
            <RotateCcw className="size-3" />
            {pageElements ? <Trans>Keep as image</Trans> : <Trans>Bring back</Trans>}
          </button>
        </span>
      ) : (
        <span className="ml-auto flex items-center gap-0.5">
          {editActions}
          <IconAction label={t`Filter out`} onClick={() => onTogglePrune(entry.imageId)}>
            <EyeOff className="size-3.5" />
          </IconAction>
        </span>
      )}
    </div>
  )
})
