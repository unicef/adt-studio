import { useState } from "react"
import { useStore } from "@tanstack/react-form"
import { msg } from "@lingui/core/macro"
import { Trans, useLingui } from "@lingui/react/macro"
import type { SetupRecommendation } from "@adt/types"
import { LanguagePicker } from "@/components/LanguagePicker"
import { getBaseLanguage, getDisplayName, normalizeLocale } from "@/lib/languages"
import { useWizardForm } from "../../../../core/wizardForm"
import { bookLanguage } from "../screens"
import { LanguagePicture } from "../../shared/art/ConceptArt"
import { PICTURE, SurePick } from "../SurePick"

const PICKER_LABEL = msg`Edit the book in`
const PICKER_HINT = msg`Picking another language translates the text into it.`
const OUTPUT_LABEL = msg`Also make it in`
const OUTPUT_HINT = msg`Output languages: extra versions of the finished book. You can add more later.`

/** The language the book will be made in: the user's pick, or the book's own (null when nothing tells). */
export function useBookLanguage(rec: SetupRecommendation): { found: string | null; picked: string | null; changed: boolean } {
  const form = useWizardForm()
  const editing = useStore(form.store, (s) => s.values.editingLanguage).trim()
  const found = bookLanguage(rec)
  const picked = editing || null
  return { found, picked, changed: !!picked && getBaseLanguage(picked) !== found }
}

/**
 * Screen 2 · Language: the language found in the book, as a sure pick, and the output languages.
 * The editing language is left empty unless the user picks another one, so a wrong guess can never
 * translate the book; picking one sets the Editing Language, which translates the text into it.
 * Output languages are extra versions of the finished book, and can also be added later.
 */
export function LanguageScreen({ rec }: { rec: SetupRecommendation }) {
  const { i18n } = useLingui()
  const form = useWizardForm()
  const [open, setOpen] = useState(false)
  const { found, picked, changed } = useBookLanguage(rec)
  const outputs = useStore(form.store, (s) => s.values.outputLanguages)
  const outputSet = new Set(outputs.map(normalizeLocale))
  const toggleOutput = (code: string) => {
    const n = normalizeLocale(code)
    form.setFieldValue("outputLanguages", outputSet.has(n) ? outputs.filter((l) => normalizeLocale(l) !== n) : [...outputs, code])
  }
  const shown = changed ? picked : found
  const source = rec.language?.source
  const outputNames = outputs.map((o) => getDisplayName(o)).join(", ")
  return (
    <SurePick
      picture={
        <span className={`qd18-pv grid shrink-0 place-items-center rounded-[12px] p-3 ${PICTURE}`}>
          <LanguagePicture code={shown ? getBaseLanguage(shown) : null} outputs={outputs.map(getBaseLanguage)} />
        </span>
      }
      label={<Trans>Language of the book</Trans>}
      title={shown ? getDisplayName(shown) : <Trans>The book&apos;s own language</Trans>}
      hint={
        changed ? (
          <Trans>Your pick. The text is translated into it.</Trans>
        ) : !found ? (
          <Trans>I couldn&apos;t tell from the PDF. It&apos;s found when the pages are read.</Trans>
        ) : source === "ai" ? (
          <Trans>Read on the pages.</Trans>
        ) : (
          <Trans>Found in the PDF&apos;s text.</Trans>
        )
      }
      result={
        <span className="flex flex-col gap-1.5">
          <span>
            {outputs.length ? (
              <Trans>
                It will also come out in: <strong className="font-semibold">{outputNames}</strong>.
              </Trans>
            ) : (
              <Trans>Want the finished book in other languages too? Add output languages here, or later from the book&apos;s Translate step.</Trans>
            )}
          </span>
        </span>
      }
      changed={changed}
      badge={!!found}
      labelId="gd-language"
      open={open}
      onToggle={() => setOpen((o) => !o)}
      others
      othersLabel={<Trans>Change the languages</Trans>}
    >
      <div className="grid gap-3 rounded-[14px] bg-[var(--lc-bubble)] p-3 lg:grid-cols-2">
        <div className="flex flex-col gap-2">
          <LanguagePicker label={i18n._(PICKER_LABEL)} hint={i18n._(PICKER_HINT)} selected={picked ?? ""} onSelect={(code) => form.setFieldValue("editingLanguage", code)} size="default" />
          {picked && (
            <button type="button" onClick={() => form.setFieldValue("editingLanguage", "")} className="lc-link self-start px-1 text-[13.5px] font-medium">
              <Trans>Keep the book&apos;s own language</Trans>
            </button>
          )}
        </div>
        <LanguagePicker label={i18n._(OUTPUT_LABEL)} hint={i18n._(OUTPUT_HINT)} selected={outputSet} onSelect={toggleOutput} multiple size="default" />
      </div>
    </SurePick>
  )
}
