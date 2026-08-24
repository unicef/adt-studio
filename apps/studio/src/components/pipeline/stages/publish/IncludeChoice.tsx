import { Trans, useLingui } from "@lingui/react/macro"
import { AlertTriangle } from "lucide-react"
import { PUBLICATION_SNAPSHOT_MAX_BYTES, type PublishFeatureSelection } from "@adt/types"
import { Switch } from "@/components/ui/switch"
import type { AvailableExportFeatures } from "@/hooks/use-export-features"

const MAX_MEGABYTES = Math.round(PUBLICATION_SNAPSHOT_MAX_BYTES / (1024 * 1024))

export interface IncludeChoiceValue {
  readAloud: boolean
  quizzes: boolean
  glossary: boolean
  signLanguage: boolean
}

/** Everything the book has, which is what publishing does unless the author says otherwise. */
export const DEFAULT_INCLUDE_CHOICE: IncludeChoiceValue = {
  readAloud: true,
  quizzes: true,
  glossary: true,
  signLanguage: true,
}

/**
 * Only the exclusions are sent. A selection that leaves everything in produces `undefined`, so
 * the request carries no `features` key and the API cannot tell it apart from a call made before
 * this control existed — which is what keeps "publish the whole book" the unchanged default.
 */
export function includeChoiceToFeatures(
  value: IncludeChoiceValue,
): PublishFeatureSelection | undefined {
  const excluded = Object.entries(value).filter(([, included]) => !included)
  if (excluded.length === 0) return undefined
  return Object.fromEntries(excluded.map(([key]) => [key, false])) as PublishFeatureSelection
}

interface IncludeChoiceProps {
  value: IncludeChoiceValue
  onChange: (value: IncludeChoiceValue) => void
  /** What this book actually has. A book with no narration shows no narration row, rather than a
   *  switch that does nothing. */
  available: AvailableExportFeatures
  disabled?: boolean
}

/**
 * What goes into the published copy.
 *
 * Exists because of the transport cap: a book is sent to Cloudflare in one piece, and a novel
 * with two narrated locales can be most of its size in audio — the part a reviewer reading for
 * layout and wording has least need of. Leaving it out is the difference between a link and no
 * link at all.
 *
 * Framed as *including* rather than excluding, and every switch starts on, because the honest
 * default is the whole book and the author should have to choose to send less.
 */
export function IncludeChoice({ value, onChange, available, disabled }: IncludeChoiceProps) {
  const { t } = useLingui()

  const rows = [
    {
      key: "readAloud" as const,
      label: t`Read aloud`,
      hint: t`Narration audio — usually the largest part of a book`,
      show: available.readAloud,
    },
    { key: "quizzes" as const, label: t`Quizzes`, hint: null, show: available.quizzes },
    { key: "glossary" as const, label: t`Glossary`, hint: null, show: available.glossary },
    {
      key: "signLanguage" as const,
      label: t`Sign language`,
      hint: t`Video — large, like audio`,
      show: available.signLanguage,
    },
  ].filter((row) => row.show)

  if (rows.length === 0) return null

  const anyExcluded = rows.some((row) => !value[row.key])

  return (
    <fieldset className="flex flex-col gap-2 rounded-xl border p-3">
      <legend className="px-1 text-xs font-medium text-foreground">
        <Trans>What to include</Trans>
      </legend>

      {rows.map((row) => (
        <label
          key={row.key}
          className="flex items-center justify-between gap-3 text-xs text-foreground"
        >
          <span className="flex min-w-0 flex-col">
            <span>{row.label}</span>
            {row.hint ? (
              <span className="text-[11px] leading-4 text-muted-foreground">{row.hint}</span>
            ) : null}
          </span>
          <Switch
            checked={value[row.key]}
            disabled={disabled}
            onCheckedChange={(checked) => onChange({ ...value, [row.key]: checked })}
            aria-label={row.label}
          />
        </label>
      ))}

      {anyExcluded ? (
        <p className="flex items-start gap-1.5 text-[11px] leading-4 text-amber-700">
          <AlertTriangle className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
          <Trans>
            What you switch off is missing from the shared copy, not from your book. Updating the
            site later keeps the same choice.
          </Trans>
        </p>
      ) : (
        <p className="text-[11px] leading-4 text-muted-foreground">
          <Trans>
            Everything is included. Leave out read-aloud or video if the book is over {MAX_MEGABYTES} MB.
          </Trans>
        </p>
      )}
    </fieldset>
  )
}
