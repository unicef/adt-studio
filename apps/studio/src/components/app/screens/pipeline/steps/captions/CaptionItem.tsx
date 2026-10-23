import { memo, useId } from "react"
import { EyeOff, PenLine, Sparkles } from "lucide-react"
import { Trans, useLingui } from "@lingui/react/macro"
import { BASE_URL } from "@/api/client"
import { Switch } from "@/components/ui/switch"
import type { CaptionEntry } from "@/components/pipeline/stages/captions/lib/types"
import { cn } from "@/lib/utils"
import { DraftField } from "../shared/list/DraftField"

export interface CaptionItemProps {
  label: string
  entry: CaptionEntry
  source: CaptionEntry["source"]
  hex: string
  edited: boolean
  locked: boolean
  stale?: boolean
  onCaption: (imageId: string, caption: string) => void
  onDecorative: (imageId: string, decorative: boolean) => void
  onOpen: (imageId: string) => void
}

export const CaptionItem = memo(function CaptionItem({
  label,
  entry,
  source,
  hex,
  edited,
  locked,
  stale = false,
  onCaption,
  onDecorative,
  onOpen,
}: CaptionItemProps) {
  const { t } = useLingui()
  const switchId = useId()
  const fieldId = useId()
  const decorative = entry.decorative === true
  const manual = source === "manual"
  const sourceLabel = manual ? t`Edited by you` : t`Written by AI`

  return (
    <article data-caption-item={entry.imageId} className="@container rounded-xl border bg-card p-3">
      <div className="grid grid-cols-1 gap-3 @[560px]:grid-cols-[minmax(0,200px)_minmax(0,1fr)]">
        <button
          type="button"
          onClick={() => onOpen(entry.imageId)}
          aria-label={t`Open image ${entry.imageId} larger`}
          className="grid h-44 place-items-center overflow-hidden rounded-lg bg-muted/40 transition-colors duration-200 hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
        >
          <img
            src={`${BASE_URL}/books/${label}/images/${entry.imageId}`}
            alt=""
            loading="lazy"
            draggable={false}
            className={cn("max-h-44 max-w-full object-contain transition-opacity duration-300 motion-reduce:transition-none", decorative && "opacity-60")}
          />
        </button>

        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span className="min-w-0 truncate font-mono text-[11px] text-muted-foreground" title={entry.imageId}>
              {entry.imageId}
            </span>
            <span role="img" aria-label={sourceLabel} className="inline-flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
              {manual ? (
                <PenLine aria-hidden className="size-3" />
              ) : (
                <Sparkles aria-hidden className="size-3" style={{ color: hex }} />
              )}
              <span aria-hidden>{sourceLabel}</span>
            </span>
            <span className="ml-auto flex shrink-0 items-center gap-2 whitespace-nowrap">
              <Switch
                id={switchId}
                checked={decorative}
                disabled={locked}
                onCheckedChange={(checked) => onDecorative(entry.imageId, checked)}
                className="h-5 w-9 [&>span]:size-4 [&>span]:data-[state=checked]:translate-x-4"
              />
              <label htmlFor={switchId} className={cn("shrink-0 whitespace-nowrap text-[12px] font-medium", locked ? "text-muted-foreground" : "cursor-pointer text-foreground")}>
                <Trans>Decorative</Trans>
              </label>
            </span>
          </div>

          <div className="flex items-center justify-between gap-2">
            <label htmlFor={fieldId} className="text-[11px] font-medium text-muted-foreground">
              <Trans>Description</Trans>
            </label>
            <span className="grid size-4 place-items-center">
              {edited && (
                <span
                  role="img"
                  aria-label={t`Edited, not saved yet`}
                  className="size-2 rounded-full animate-in fade-in zoom-in-50 duration-200 motion-reduce:animate-none"
                  style={{ background: hex }}
                />
              )}
            </span>
          </div>

          {decorative ? (
            <p className="flex items-center gap-1.5 rounded-md border border-dashed px-2.5 py-2 text-[12px] text-muted-foreground animate-in fade-in duration-200 motion-reduce:animate-none">
              <EyeOff aria-hidden className="size-3.5 shrink-0" />
              <span id={fieldId}>
                <Trans>Screen readers skip this image.</Trans>
              </span>
            </p>
          ) : (
            <DraftField
              id={fieldId}
              multiline
              value={entry.caption}
              onCommit={(next) => onCaption(entry.imageId, next)}
              ariaLabel={t`Description of ${entry.imageId}`}
              placeholder={t`Describe this image…`}
              disabled={locked}
            />
          )}

          {stale && (
            <p className="text-[11px] text-muted-foreground">
              <Trans>Doesn't match the filter any more</Trans>
            </p>
          )}
        </div>
      </div>
    </article>
  )
})
