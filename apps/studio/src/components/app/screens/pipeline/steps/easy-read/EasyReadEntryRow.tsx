import { memo } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import type { EasyReadEntry, EasyReadSectionBlock } from "@/api/client"
import { cn } from "@/lib/utils"
import { DraftField } from "../shared/list/DraftField"
import type { EasyReadBlockKey } from "./useEasyReadEdits"

export type EasyReadLayout = "columns" | "stacked"

const LABEL = "flex min-h-4 items-center gap-1.5 text-[11px] font-medium text-muted-foreground"
const TINT_TEXT = "text-[color-mix(in_oklab,var(--chrome-hex)_80%,black)] dark:text-[color-mix(in_oklab,var(--chrome-hex)_70%,white)]"
const FIELD_TINT = cn(
  "hover:border-[color-mix(in_srgb,var(--chrome-hex,var(--ring))_35%,var(--border))]",
  "focus:border-[color-mix(in_srgb,var(--chrome-hex,var(--ring))_55%,transparent)] focus:ring-[color-mix(in_srgb,var(--chrome-hex,var(--ring))_22%,transparent)]",
)

export const EasyReadEntryRow = memo(function EasyReadEntryRow({
  block,
  entry,
  layout,
  edited,
  locked,
  onUpdate,
}: {
  block: EasyReadSectionBlock
  entry: EasyReadEntry
  layout: EasyReadLayout
  edited: boolean
  locked: boolean
  onUpdate: (blockKey: EasyReadBlockKey, easyReadId: string, text: string) => void
}) {
  const { t } = useLingui()
  const unchanged = entry.text.trim() === entry.originalText.trim()

  return (
    <div data-easy-read-entry={entry.easyReadId} className={cn("grid gap-x-4 gap-y-2", layout === "columns" && "md:grid-cols-2")}>
      <div className="flex min-w-0 flex-col gap-1">
        <span className={LABEL}>
          <Trans>Original</Trans>
        </span>
        <p className="whitespace-pre-line rounded-md border border-transparent bg-muted/45 px-2.5 py-1.5 text-[13px] leading-relaxed text-muted-foreground">
          {entry.originalText}
        </p>
      </div>
      <div className="flex min-w-0 flex-col gap-1">
        <span className={cn(LABEL, !unchanged && TINT_TEXT)}>
          <Trans>Easy Read</Trans>
          <span
            role={edited ? "img" : undefined}
            aria-label={edited ? t`Edited` : undefined}
            aria-hidden={edited ? undefined : true}
            className={cn(
              "size-1.5 rounded-full bg-[var(--chrome-hex)] transition-[opacity,scale] duration-200 ease-out motion-reduce:transition-none",
              edited ? "scale-100 opacity-100" : "scale-50 opacity-0",
            )}
          />
        </span>
        <DraftField
          multiline
          value={entry.text}
          onCommit={(text) => onUpdate(block, entry.easyReadId, text)}
          disabled={locked}
          ariaLabel={t`Easy Read text`}
          className={cn(FIELD_TINT, unchanged && "text-muted-foreground focus:text-foreground")}
        />
      </div>
    </div>
  )
})
