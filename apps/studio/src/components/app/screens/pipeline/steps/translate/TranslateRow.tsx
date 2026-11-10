import { memo } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { BASE_URL } from "@/api/client"
import { cn } from "@/lib/utils"
import { tint } from "@/components/app/screens/pipeline/shared/tint"
import { QUIET_CHIP } from "../shared/ui"
import { RowSaveTick } from "./RowSaveTick"
import { TranslateField } from "./TranslateField"
import { ReviewInline } from "./review/ReviewInline"
import type { ReviewItem } from "./review/reviewState"
import type { TranslateRow as TranslateRowData } from "./translateState"
import type { RowSave } from "./useTranslationSave"

export interface ImageOpen {
  src: string
  caption: string
}

const THUMB = "h-12 w-16 shrink-0 rounded"

function EntryThumb({ src, caption, label, onOpen }: { src: string; caption: string; label: string; onOpen: (image: ImageOpen) => void }) {
  return (
    <button
      type="button"
      onClick={() => onOpen({ src, caption })}
      aria-label={label}
      className="size-fit shrink-0 cursor-zoom-in rounded ring-1 ring-border transition-shadow duration-150 hover:ring-2 hover:ring-[color-mix(in_srgb,var(--chrome-hex)_60%,transparent)] focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--chrome-hex)_60%,transparent)] focus-visible:outline-none"
    >
      <img src={src} alt="" loading="lazy" className={cn(THUMB, "object-cover")} />
    </button>
  )
}

function NoTranslatedImage() {
  const { t } = useLingui()
  return (
    <span
      title={t`This image wasn't translated for this language. Readers see the original.`}
      className={cn(THUMB, "grid place-items-center border border-dashed bg-muted/30 px-1 text-center text-[9.5px] leading-tight text-muted-foreground")}
    >
      <Trans>Original image</Trans>
    </span>
  )
}

export interface TranslateRowProps {
  row: TranslateRowData
  label: string
  hex: string
  language: string
  isBase: boolean
  locked: boolean
  place: string
  translatedImageId?: string
  save?: RowSave
  review?: ReviewItem
  applied: boolean
  accepting: boolean
  onSave: (id: string, text: string, previous: string) => void
  onUndo: (id: string) => void
  onRetry: (id: string) => void
  onApplySuggestion: (id: string, text: string, previous: string) => void
  onAcceptAnyway: (id: string) => void
  onOpenImage: (image: ImageOpen) => void
}

export const TranslateRow = memo(function TranslateRow({
  row,
  label,
  hex,
  language,
  isBase,
  locked,
  place,
  translatedImageId,
  save,
  review,
  applied,
  accepting,
  onSave,
  onUndo,
  onRetry,
  onApplySuggestion,
  onAcceptAnyway,
  onOpenImage,
}: TranslateRowProps) {
  const { t } = useLingui()
  const untranslated = !isBase && row.target.trim() === ""
  const sourceSrc = row.isImage ? `${BASE_URL}/books/${label}/images/${row.id}` : null

  const meta = (
    <div className="flex min-h-5 flex-wrap items-center gap-1.5">
      <span title={row.id} className="text-[11px] font-medium text-muted-foreground">
        {place}
      </span>
      {row.isAnswer && (
        <span className={QUIET_CHIP}>
          <Trans>Answer</Trans>
        </span>
      )}
      {untranslated && (
        <span className={QUIET_CHIP} style={{ borderColor: tint(hex, 0.45), color: hex }}>
          <Trans>Untranslated</Trans>
        </span>
      )}
      {row.readOnly && (
        <span className={QUIET_CHIP} title={t`Easy Read text is written in the Easy Read step.`}>
          <Trans>Edit in Easy Read</Trans>
        </span>
      )}
      <span className="ml-auto">
        {save && <RowSaveTick state={save.state} onUndo={() => onUndo(row.id)} onRetry={() => onRetry(row.id)} />}
      </span>
    </div>
  )

  const field = (value: string, ariaLabel: string, placeholder: string, lang: string) =>
    row.readOnly ? (
      <p lang={lang} dir="auto" className="min-w-0 flex-1 px-1.5 py-1 text-[12.5px] leading-relaxed whitespace-pre-wrap">
        {value}
      </p>
    ) : (
      <TranslateField
        value={value}
        ariaLabel={ariaLabel}
        placeholder={placeholder}
        disabled={locked}
        lang={lang}
        onCommit={(text) => onSave(row.id, text, value)}
        className="min-w-0 flex-1"
      />
    )

  return (
    <div
      data-row-id={row.id}
      className="flex flex-col gap-1 rounded-xl border bg-card px-3.5 py-2.5 transition-colors duration-200 motion-reduce:transition-none"
      style={{ borderColor: tint(hex, untranslated ? 0.45 : 0.24) }}
    >
      {meta}

      {isBase ? (
        <div className="flex items-start gap-3">
          {sourceSrc && <EntryThumb src={sourceSrc} caption={row.source} label={t`Open the image for ${place}`} onOpen={onOpenImage} />}
          {field(row.source, t`Text of ${place}`, t`Empty`, language)}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          <div className="flex min-w-0 items-start gap-3">
            {sourceSrc && <EntryThumb src={sourceSrc} caption={row.source} label={t`Open the original image for ${place}`} onOpen={onOpenImage} />}
            <p dir="auto" className="min-w-0 flex-1 px-1.5 py-1 text-[12.5px] leading-relaxed whitespace-pre-wrap text-muted-foreground">
              {row.source}
            </p>
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <div className="flex min-w-0 items-start gap-3">
              {row.isImage &&
                (translatedImageId ? (
                  <EntryThumb
                    src={`${BASE_URL}/books/${label}/images/${translatedImageId}`}
                    caption={row.target || row.source}
                    label={t`Open the translated image for ${place}`}
                    onOpen={onOpenImage}
                  />
                ) : (
                  <NoTranslatedImage />
                ))}
              {field(row.target, t`Translation of ${place}`, t`Not translated yet`, language)}
            </div>
            {review && (
              <ReviewInline
                item={review}
                hex={hex}
                applied={applied}
                accepting={accepting}
                locked={locked}
                onApply={(text) => onApplySuggestion(row.id, text, row.target)}
                onAcceptAnyway={() => onAcceptAnyway(row.id)}
              />
            )}
          </div>
        </div>
      )}
    </div>
  )
})
