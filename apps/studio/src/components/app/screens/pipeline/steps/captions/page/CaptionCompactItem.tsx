import { memo, useEffect, useId, useRef, useState } from "react"
import { EyeOff, Maximize2, PenLine, Sparkles } from "lucide-react"
import { Trans, useLingui } from "@lingui/react/macro"
import { BASE_URL } from "@/api/client"
import { Switch } from "@/components/ui/switch"
import type { CaptionEntry } from "@/components/pipeline/stages/captions/lib/types"
import { cn, prefersReducedMotion } from "@/lib/utils"
import { DraftField } from "../../shared/list/DraftField"
import { CaptionSaveTick } from "../CaptionSaveTick"
import type { CaptionSaveState } from "../useCaptionEdits"

const CLAMP_CHARS = 180

export const CaptionCompactItem = memo(function CaptionCompactItem({
  label,
  entry,
  number,
  source,
  edited,
  locked,
  stale,
  active,
  selected,
  onCaption,
  onDecorative,
  onOpen,
  onHover,
  onSelect,
  saveState = null,
  onUndo,
}: {
  label: string
  entry: CaptionEntry
  number: number
  source: CaptionEntry["source"]
  edited: boolean
  locked: boolean
  stale: boolean
  active: boolean
  selected: boolean
  onCaption: (imageId: string, caption: string) => void
  onDecorative: (imageId: string, decorative: boolean) => void
  onOpen: (imageId: string) => void
  onHover: (imageId: string | null) => void
  onSelect: (imageId: string) => void
  saveState?: CaptionSaveState | null
  onUndo?: (imageId: string) => void
}) {
  const { t } = useLingui()
  const switchId = useId()
  const fieldId = useId()
  const ref = useRef<HTMLElement>(null)
  const decorative = entry.decorative === true
  const [focused, setFocused] = useState(false)
  const clamp = !focused && entry.caption.length > CLAMP_CHARS
  const fieldBox = useRef<HTMLDivElement>(null)
  const manual = source === "manual"
  const sourceLabel = manual ? t`Edited by you` : t`Written by AI`

  useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ block: "nearest", behavior: prefersReducedMotion() ? "auto" : "smooth" })
  }, [selected])

  return (
    <article
      ref={ref}
      data-caption-item={entry.imageId}
      onMouseEnter={() => onHover(entry.imageId)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(entry.imageId)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onHover(null)
      }}
      onClick={(event) => {
        if ((event.target as HTMLElement).closest("button, textarea, input, label, a")) return
        onSelect(entry.imageId)
      }}
      className={cn(
        "flex flex-col gap-2 rounded-xl border bg-card p-2.5 transition-[background-color,box-shadow,border-color] duration-[180ms] ease-out motion-reduce:transition-none",
        selected
          ? "border-[color-mix(in_srgb,var(--chrome-hex)_45%,transparent)] bg-[color-mix(in_srgb,var(--chrome-hex)_7%,var(--card))] shadow-[0_0_0_3px_color-mix(in_srgb,var(--chrome-hex)_14%,transparent)]"
          : active
            ? "border-[color-mix(in_srgb,var(--chrome-hex)_30%,transparent)]"
            : "",
      )}
    >
      <div className="flex items-start gap-2.5">
        <button
          type="button"
          onClick={() => onOpen(entry.imageId)}
          aria-label={t`Open image ${entry.imageId} larger`}
          title={t`Open larger`}
          className="group/thumb relative grid size-14 shrink-0 place-items-center overflow-hidden rounded-lg border bg-muted/40 outline-none transition-colors hover:bg-muted/70 focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--chrome-hex)_55%,transparent)]"
        >
          <img
            src={`${BASE_URL}/books/${label}/images/${entry.imageId}`}
            alt={decorative ? "" : entry.caption}
            loading="lazy"
            draggable={false}
            className={cn("max-h-full max-w-full object-contain transition-opacity duration-300 motion-reduce:transition-none", decorative && "opacity-60 grayscale")}
          />
          <span className="absolute inset-0 grid place-items-center bg-black/35 text-white opacity-0 transition-opacity duration-150 group-hover/thumb:opacity-100 group-focus-visible/thumb:opacity-100">
            <Maximize2 className="size-3.5" />
          </span>
        </button>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-center gap-1.5">
            <span
              className={cn(
                "grid h-5 min-w-5 shrink-0 place-items-center rounded-md px-1 font-mono text-[10.5px] font-semibold tabular-nums transition-colors duration-[180ms] motion-reduce:transition-none",
                active || selected ? "bg-[var(--chrome-hex)] text-white" : "bg-muted text-muted-foreground",
              )}
            >
              {number}
            </span>
            <span className="min-w-0 flex-1 truncate font-mono text-[10.5px] text-muted-foreground" title={entry.imageId}>
              {entry.imageId}
            </span>
            {saveState && onUndo && <CaptionSaveTick state={saveState} onUndo={() => onUndo(entry.imageId)} />}
            <span className="grid size-4 shrink-0 place-items-center">
              {edited && !saveState && (
                <span
                  role="img"
                  aria-label={t`Edited, not saved yet`}
                  className="size-2 rounded-full bg-[var(--chrome-hex)] animate-in fade-in zoom-in-50 duration-200 motion-reduce:animate-none"
                />
              )}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span role="img" aria-label={sourceLabel} className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              {manual ? <PenLine aria-hidden className="size-3" /> : <Sparkles aria-hidden className="size-3 text-[var(--chrome-hex)]" />}
              <span aria-hidden>{sourceLabel}</span>
            </span>
            <span className="ml-auto flex items-center gap-1.5">
              <Switch
                id={switchId}
                checked={decorative}
                disabled={locked}
                onCheckedChange={(checked) => onDecorative(entry.imageId, checked)}
                className="h-4.5 w-8 data-[state=checked]:bg-[var(--chrome-hex)] [&>span]:size-3.5 [&>span]:data-[state=checked]:translate-x-3.5"
              />
              <label htmlFor={switchId} className={cn("text-[11.5px] font-medium", locked ? "text-muted-foreground" : "cursor-pointer text-foreground")}>
                <Trans>Decorative</Trans>
              </label>
            </span>
          </div>
        </div>
      </div>

      {decorative ? (
        <p className="flex items-center gap-1.5 rounded-lg border border-dashed px-2.5 py-2 text-[12px] text-muted-foreground animate-in fade-in duration-200 motion-reduce:animate-none">
          <EyeOff aria-hidden className="size-3.5 shrink-0" />
          <span id={fieldId}>
            <Trans>Screen readers skip this image.</Trans>
          </span>
        </p>
      ) : (
        <div
          ref={fieldBox}
          onFocus={() => setFocused(true)}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false)
          }}
          className={cn("relative", clamp && "[&_textarea]:max-h-[104px] [&_textarea]:overflow-hidden")}
        >
          <DraftField
            id={fieldId}
            multiline
            value={entry.caption}
            onCommit={(next) => onCaption(entry.imageId, next)}
            ariaLabel={t`Description of ${entry.imageId}`}
            placeholder={t`Describe this image…`}
            disabled={locked}
          />
          {clamp && (
            <button
              type="button"
              onClick={() => fieldBox.current?.querySelector("textarea")?.focus()}
              className="absolute inset-x-px bottom-px flex h-9 items-end justify-end rounded-b-[inherit] bg-gradient-to-t from-card via-card/90 to-transparent px-2.5 pb-1.5 text-[11.5px] font-semibold text-[color-mix(in_oklab,var(--chrome-hex)_80%,black)] transition-opacity duration-150 dark:text-[color-mix(in_oklab,var(--chrome-hex)_70%,white)]"
            >
              {t`Show all`}
            </button>
          )}
        </div>
      )}

      {stale && (
        <p className="text-[11px] text-muted-foreground">
          <Trans>Doesn't match the filter any more</Trans>
        </p>
      )}
    </article>
  )
})
