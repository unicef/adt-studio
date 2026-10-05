import { memo } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { BASE_URL } from "@/api/client"
import { cn } from "@/lib/utils"
import { tint } from "@/components/app/screens/pipeline/shared/plugins"
import { EditableText } from "../shared/ui"
import type { TranslateRow as TranslateRowData } from "./translateState"

function EntryThumb({
  label,
  entryId,
  onOpen,
}: {
  label: string
  entryId: string
  onOpen: (src: string) => void
}) {
  const { t } = useLingui()
  const src = `${BASE_URL}/books/${label}/images/${entryId}`
  return (
    <button
      type="button"
      onClick={() => onOpen(src)}
      aria-label={t`Open image for ${entryId}`}
      className="size-fit shrink-0 rounded ring-1 ring-border transition-shadow hover:ring-brand-400"
    >
      <img src={src} alt="" loading="lazy" className="h-12 w-16 rounded object-cover" />
    </button>
  )
}

export interface TranslateRowProps {
  row: TranslateRowData
  label: string
  hex: string
  language: string
  isBase: boolean
  isSaving: boolean
  onSave: (id: string, text: string) => void
  onOpenImage: (src: string) => void
}

export const TranslateRow = memo(function TranslateRow({
  row,
  label,
  hex,
  language,
  isBase,
  isSaving,
  onSave,
  onOpenImage,
}: TranslateRowProps) {
  const { t } = useLingui()

  const meta = (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="font-mono text-[10px] text-muted-foreground">{row.id}</span>
      {row.isAnswer ? (
        <span className="rounded bg-amber-100 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-700">
          <Trans>Answer</Trans>
        </span>
      ) : null}
      {!isBase && row.target.trim() === "" ? (
        <span className="rounded bg-muted px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
          <Trans>Untranslated</Trans>
        </span>
      ) : null}
    </div>
  )

  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-xl border bg-card p-3.5",
        row.isAnswer && "bg-amber-50/40 dark:bg-amber-950/10",
      )}
      style={{ borderColor: tint(hex, 0.3) }}
    >
      {meta}

      {isBase ? (
        <div className="flex items-start gap-3">
          {row.isImage ? (
            <EntryThumb label={label} entryId={row.id} onOpen={onOpenImage} />
          ) : null}
          <EditableText
            value={row.source}
            ariaLabel={t`text of ${row.id}`}
            placeholder={t`Empty`}
            isSaving={isSaving}
            onSave={(text) => onSave(row.id, text)}
            className="min-w-0 flex-1 text-[12.5px] leading-relaxed"
          />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3.5">
          <div className="flex min-w-0 items-start gap-3">
            {row.isImage ? (
              <EntryThumb label={label} entryId={row.id} onOpen={onOpenImage} />
            ) : null}
            <p className="min-w-0 flex-1 px-1.5 text-[12.5px] leading-relaxed text-muted-foreground">
              {row.source}
            </p>
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <span
              className="w-fit rounded px-1.5 font-mono text-[10px] uppercase"
              style={{ background: tint(hex, 0.12), color: hex }}
            >
              {language}
            </span>
            <EditableText
              value={row.target}
              ariaLabel={t`translation of ${row.id}`}
              placeholder={t`Pending…`}
              isSaving={isSaving}
              onSave={(text) => onSave(row.id, text)}
              className="text-[12.5px] leading-relaxed"
            />
          </div>
        </div>
      )}
    </div>
  )
})
