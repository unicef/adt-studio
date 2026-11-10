import { memo, useEffect, useRef, useState } from "react"
import { PenLine } from "lucide-react"
import { useLingui } from "@lingui/react/macro"
import { cn, prefersReducedMotion } from "@/lib/utils"
import { DraftField } from "../../shared/list/DraftField"
import { MutedLabel } from "../../shared/list/MutedLabel"
import { MUTED_MEDIA, MUTED_PRIMARY } from "../../shared/ui"
import { SourceMark } from "../GlossaryRowSummary"
import { TermStateButton } from "../TermStateButton"
import { VariationsMark } from "../VariationsMark"
import type { GlossaryRow, GlossaryTextPatch } from "../glossaryRows"

const CLAMP_CHARS = 180

export const GlossaryCompactTerm = memo(function GlossaryCompactTerm({
  row,
  hex,
  hits,
  edited,
  locked,
  active,
  selected,
  onHover,
  onText,
  onPrune,
  onRemove,
  onEdit,
}: {
  row: GlossaryRow
  hex: string
  hits: number
  edited: boolean
  locked: boolean
  active: boolean
  selected: boolean
  onHover: (key: string | null) => void
  onText: (key: string, patch: GlossaryTextPatch) => void
  onPrune: (key: string, pruned: boolean) => void
  onRemove: (key: string) => void
  onEdit: (key: string) => void
}) {
  const { t } = useLingui()
  const ref = useRef<HTMLElement>(null)
  const fieldBox = useRef<HTMLDivElement>(null)
  const [focused, setFocused] = useState(false)
  const pruned = row.pruned === true
  const clamp = !focused && row.definition.length > CLAMP_CHARS

  useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ block: "nearest", behavior: prefersReducedMotion() ? "auto" : "smooth" })
  }, [selected])

  return (
    <article
      ref={ref}
      data-term-key={row._key}
      onMouseEnter={() => onHover(row._key)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(row._key)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onHover(null)
      }}
      className={cn(
        "flex flex-col gap-2 rounded-xl border p-2.5 transition-[background-color,box-shadow,border-color] duration-[180ms] ease-out motion-reduce:transition-none",
        pruned ? "bg-muted/30" : "bg-card",
        selected
          ? "border-[color-mix(in_srgb,var(--chrome-hex)_45%,transparent)] shadow-[0_0_0_3px_color-mix(in_srgb,var(--chrome-hex)_14%,transparent)]"
          : active && "border-[color-mix(in_srgb,var(--chrome-hex)_30%,transparent)]",
      )}
    >
      <div className="flex min-h-7 items-center gap-1.5">
        <SourceMark row={row} hex={hex} />
        <span className={cn("min-w-0 truncate text-[13px] font-semibold text-foreground", pruned && MUTED_PRIMARY)}>{row.word}</span>
        {row.emojis.length > 0 && (
          <>
            <span aria-hidden className={cn("shrink-0 text-[13px] tracking-[2px]", pruned && MUTED_MEDIA)}>
              {row.emojis.join("")}
            </span>
            <span className="sr-only">{row.emojis.join(" ")}</span>
          </>
        )}
        {pruned && <MutedLabel description={t`Pruned: left out of the book`}>{t`Pruned`}</MutedLabel>}
        <span className="grid size-4 shrink-0 place-items-center">
          {edited && (
            <span
              role="img"
              aria-label={t`Edited, not saved yet`}
              className="size-2 rounded-full bg-[var(--chrome-hex)] animate-in fade-in zoom-in-50 duration-200 motion-reduce:animate-none"
            />
          )}
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-1">
          <VariationsMark variations={row.variations} />
          {hits > 0 && (
            <span title={t`Appears ${hits}× on this page`} className="font-mono text-[11px] tabular-nums text-muted-foreground">
              {t`${hits}×`}
            </span>
          )}
          <button
            type="button"
            onClick={() => onEdit(row._key)}
            aria-label={t`Edit every field of ${row.word}`}
            title={t`Edit word, emojis, picture and video`}
            className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <PenLine className="size-3.5" />
          </button>
          <TermStateButton row={row} locked={locked} onPrune={(next) => onPrune(row._key, next)} onRemove={() => onRemove(row._key)} />
        </span>
      </div>
      <div
        ref={fieldBox}
        onFocus={() => setFocused(true)}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false)
        }}
        className={cn("relative", clamp && "[&_textarea]:max-h-[104px] [&_textarea]:overflow-hidden", pruned && "opacity-70")}
      >
        <DraftField
          multiline
          value={row.definition}
          disabled={locked}
          ariaLabel={t`Definition of ${row.word}`}
          placeholder={t`Add a definition…`}
          onCommit={(definition) => onText(row._key, { definition })}
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
    </article>
  )
})
