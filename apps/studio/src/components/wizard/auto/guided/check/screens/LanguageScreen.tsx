import { useState, type ReactNode } from "react"
import { CircleHelp, Languages, Layers } from "lucide-react"
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
import { LanguageHelp } from "./LanguageHelp"

const PICKER_LABEL = msg`Edit the book in`
const OUTPUT_LABEL = msg`Also make it in`

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
  const [help, setHelp] = useState(false)
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
        <span className="flex flex-col items-start gap-1">
          <span>
            {outputs.length ? (
              <Trans>
                You edit it in this language. It also comes out in <strong className="font-semibold">{outputNames}</strong>.
              </Trans>
            ) : (
              <Trans>You edit it in this language. The finished book can also come out in others.</Trans>
            )}
          </span>
          <button type="button" onClick={() => setHelp(true)} className="lc-link -ml-1 inline-flex min-h-8 items-center gap-1.5 px-1 text-[13.5px] font-medium">
            <CircleHelp className="size-4" />
            <Trans>How do languages work?</Trans>
          </button>
          <LanguageHelp open={help} onOpenChange={setHelp} found={found ? getDisplayName(found) : null} />
        </span>
      }
      changed={changed}
      badge={!!found}
      labelId="gd-language"
      open={open}
      onToggle={() => setOpen((o) => !o)}
      others
      othersLabel={<Trans>Change the languages</Trans>}
      hideLabel={<Trans>Hide the languages</Trans>}
    >
      <div className="flex flex-col gap-3">
        <LangPart icon={<Languages className="size-4" />} title={i18n._(PICKER_LABEL)} hint={<Trans>Only change it to translate the text into another language.</Trans>}>
          <LanguagePicker label={i18n._(PICKER_LABEL)} selected={picked ?? ""} onSelect={(code) => form.setFieldValue("editingLanguage", code)} size="default" />
          {picked && (
            <button type="button" onClick={() => form.setFieldValue("editingLanguage", "")} className="lc-link self-start px-1 text-[13.5px] font-medium">
              {found ? <Trans>Keep {getDisplayName(found)}</Trans> : <Trans>Keep the book&apos;s own language</Trans>}
            </button>
          )}
        </LangPart>
        <LangPart icon={<Layers className="size-4" />} title={i18n._(OUTPUT_LABEL)} hint={<Trans>Extra versions of the finished book, translated from it. Optional.</Trans>}>
          <LanguagePicker label={i18n._(OUTPUT_LABEL)} selected={outputSet} onSelect={toggleOutput} multiple size="default" />
        </LangPart>
      </div>
    </SurePick>
  )
}

/** One of the two language choices: an icon, what it is, a line on what it does, and its picker. */
function LangPart({ icon, title, hint, children }: { icon: ReactNode; title: string; hint: ReactNode; children: ReactNode }) {
  return (
    <section className="flex gap-3 rounded-[14px] bg-[var(--lc-bubble)] p-4 [&_label]:sr-only">
      <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">{icon}</span>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div>
          <h3 className="text-[15px] font-semibold">{title}</h3>
          <p className="text-[13.5px] text-muted-foreground">{hint}</p>
        </div>
        {children}
      </div>
    </section>
  )
}
