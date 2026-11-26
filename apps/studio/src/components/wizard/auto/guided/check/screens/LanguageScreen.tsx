import { useState, type ReactNode } from "react"
import { Languages } from "lucide-react"
import { useStore } from "@tanstack/react-form"
import { msg } from "@lingui/core/macro"
import { Trans, useLingui } from "@lingui/react/macro"
import type { SetupRecommendation } from "@adt/types"
import { LanguagePicker } from "@/components/LanguagePicker"
import { getBaseLanguage, getDisplayName } from "@/lib/languages"
import { useWizardForm } from "../../../../core/wizardForm"
import { bookLanguage } from "../screens"
import { LanguagePicture } from "../../shared/art/ConceptArt"
import { PICTURE, SurePick } from "../SurePick"
import { LanguageHelp } from "./LanguageHelp"
import { useExplain } from "../../shared/explain"

const PICKER_LABEL = msg`Edit the book in`

/** The language the book will be made in: the user's pick, or the book's own (null when nothing tells). */
export function useBookLanguage(rec: SetupRecommendation): { found: string | null; picked: string | null; changed: boolean } {
  const form = useWizardForm()
  const editing = useStore(form.store, (s) => s.values.editingLanguage).trim()
  const found = bookLanguage(rec)
  const picked = editing || null
  return { found, picked, changed: !!picked && getBaseLanguage(picked) !== found }
}

/**
 * Screen 2 · Language: the language found in the book, as a sure pick, which the user can change.
 * The editing language is left empty unless the user picks another one, so a wrong guess can never
 * translate the book; picking one sets the Editing Language, which translates the text into it.
 * Extra output languages are added later, from the book's Translate step.
 */
export function LanguageScreen({ rec }: { rec: SetupRecommendation }) {
  const { i18n } = useLingui()
  const form = useWizardForm()
  const [open, setOpen] = useState(false)
  const [help, setHelp] = useState(false)
  // The assistant's bubble offers this explanation ("Not sure? I can explain ...").
  useExplain("languages", () => setHelp(true))
  const { found, picked, changed } = useBookLanguage(rec)
  const outputs = useStore(form.store, (s) => s.values.outputLanguages)
  const shown = changed ? picked : found
  const source = rec.language?.source
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
            <Trans>You edit the book in this language.</Trans>
          </span>
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
      </div>
    </SurePick>
  )
}

/** One of the two language choices: an icon, what it is, a line on what it does, and its picker. */
function LangPart({ icon, title, hint, children }: { icon: ReactNode; title: string; hint: ReactNode; children: ReactNode }) {
  return (
    // While its list is open, the card grows to hold it and scrolls clear of the bottom bar.
    <section
      className="flex gap-3 rounded-[14px] bg-[var(--lc-bubble)] p-4 transition-[padding] duration-200 focus-within:pb-[216px] [&_label]:sr-only"
      onFocus={(e) => {
        const card = e.currentTarget
        window.setTimeout(() => {
          // Scroll the page just enough that the card's bottom clears the fixed bottom bar.
          const bar = document.querySelector(".gd-bar")?.getBoundingClientRect().top ?? window.innerHeight
          const below = card.getBoundingClientRect().bottom + 16 - bar
          if (below > 0) scrollerOf(card)?.scrollBy({ top: below, behavior: "smooth" })
        }, 220)
      }}
    >
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

/** The nearest ancestor that scrolls (the flow's page). */
function scrollerOf(el: HTMLElement): HTMLElement | null {
  for (let e = el.parentElement; e; e = e.parentElement) if (/(auto|scroll)/.test(getComputedStyle(e).overflowY) && e.scrollHeight > e.clientHeight) return e
  return null
}
