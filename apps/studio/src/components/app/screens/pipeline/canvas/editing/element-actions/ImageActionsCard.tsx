import { useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { Crop, Eye, EyeOff, ImageOff, Images, Loader2, Scissors, Sparkles, Trash2, Upload, ScanLine, type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import type { StyleEditorElementProps } from "@/components/pipeline/stages/storyboard/components/style-editor/ElementActions"
import { HEADER_BUTTON, HEADER_BUTTON_LABELLED, HeaderButtonTile } from "@/components/app/screens/pipeline/steps/shared/headerButton"

const QUIET = cn(
  "flex h-8 items-center gap-1.5 rounded-lg px-2 text-[12px] font-medium text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground",
  "outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--chrome-hex)_45%,transparent)]",
)

interface ImageAction {
  key: string
  label: string
  short?: string
  icon: LucideIcon
  run: ((dataId: string) => void) | undefined
  busy?: boolean
}

export function ImageActionsCard({ dataId, elementProps }: { dataId: string; elementProps: StyleEditorElementProps }) {
  const { t } = useLingui()
  const [failed, setFailed] = useState(false)
  const { imageSrc, segmenting } = elementProps
  const actions: ImageAction[] = [
    { key: "crop", label: t`Crop`, icon: Crop, run: elementProps.onCrop },
    { key: "recrop", label: t`Recrop from page`, short: t`Recrop`, icon: ScanLine, run: elementProps.onRecropFromPage },
    { key: "replace", label: t`Replace`, icon: Upload, run: elementProps.onReplace },
    { key: "book", label: t`Replace from book`, short: t`From book`, icon: Images, run: elementProps.onReplaceFromBook },
    { key: "ai", label: t`AI image`, icon: Sparkles, run: elementProps.onAiImage },
    { key: "segment", label: segmenting ? t`Segmenting…` : t`Segment`, icon: segmenting ? Loader2 : Scissors, run: elementProps.onSegment, busy: segmenting },
  ]
  const available = actions.filter((action) => action.run)

  return (
    <section aria-label={t`Image actions`} className="flex flex-col gap-3 border-b pt-3 pb-4">
      {imageSrc && (
        <div className="grid max-h-40 place-items-center overflow-hidden rounded-xl border bg-muted/40 p-2 animate-in fade-in duration-200 motion-reduce:animate-none">
          {failed ? (
            <ImageOff className="size-5 text-muted-foreground/50" />
          ) : (
            <img src={imageSrc} alt={t`Selected image`} onError={() => setFailed(true)} className={cn("max-h-36 w-full object-contain", elementProps.isPruned && "opacity-50 grayscale")} />
          )}
        </div>
      )}
      {available.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {available.map((action) => (
            <button
              key={action.key}
              type="button"
              onClick={() => action.run?.(dataId)}
              disabled={action.busy}
              aria-label={action.label}
              title={action.label}
              className={cn(HEADER_BUTTON, HEADER_BUTTON_LABELLED, "min-w-0 text-[12px]")}
            >
              <HeaderButtonTile icon={action.icon} />
              <span className="truncate">{action.short ?? action.label}</span>
            </button>
          ))}
        </div>
      )}
      {(elementProps.onTogglePrune || elementProps.onDelete) && (
        <div className="flex items-center gap-1">
          {elementProps.onTogglePrune && (
            <button type="button" onClick={() => elementProps.onTogglePrune?.(dataId)} aria-pressed={!!elementProps.isPruned} className={QUIET}>
              {elementProps.isPruned ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
              {elementProps.isPruned ? <Trans>Hidden from the book</Trans> : <Trans>Hide from the book</Trans>}
            </button>
          )}
          {elementProps.onDelete && (
            <button type="button" onClick={() => elementProps.onDelete?.(dataId)} className={cn(QUIET, "ml-auto hover:bg-destructive/10 hover:text-destructive")}>
              <Trash2 className="size-3.5" />
              <Trans>Delete</Trans>
            </button>
          )}
        </div>
      )}
    </section>
  )
}
