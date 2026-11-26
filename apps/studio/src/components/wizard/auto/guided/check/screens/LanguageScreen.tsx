import { useState } from "react"
import { useStore } from "@tanstack/react-form"
import { msg } from "@lingui/core/macro"
import { Trans, useLingui } from "@lingui/react/macro"
import { Languages } from "lucide-react"
import type { SetupRecommendation } from "@adt/types"
import { LanguagePicker } from "@/components/LanguagePicker"
import { getBaseLanguage, getDisplayName } from "@/lib/languages"
import { useWizardForm } from "../../../../core/wizardForm"
import { bookLanguage } from "../screens"
import { SurePick } from "../SurePick"

const PICKER_LABEL = msg`Make the book in`

/** The language the book will be made in: the user's pick, or the book's own (null when nothing tells). */
export function useBookLanguage(rec: SetupRecommendation): { found: string | null; picked: string | null; changed: boolean } {
  const form = useWizardForm()
  const editing = useStore(form.store, (s) => s.values.editingLanguage).trim()
  const found = bookLanguage(rec)
  const picked = editing || null
  return { found, picked, changed: !!picked && getBaseLanguage(picked) !== found }
}

/**
 * Screen 2 · Language: the language found in the book, as a sure pick. Nothing goes into the form
 * unless the user picks another language, so a wrong guess can never translate the book; picking
 * one sets the Editing Language, which translates the text into it.
 */
export function LanguageScreen({ rec }: { rec: SetupRecommendation }) {
  const { i18n } = useLingui()
  const form = useWizardForm()
  const [open, setOpen] = useState(false)
  const { found, picked, changed } = useBookLanguage(rec)
  const shown = changed ? picked : found
  const source = rec.language?.source
  return (
    <SurePick
      picture={
        <span className="qd18-pv flex h-[150px] w-full shrink-0 flex-col items-center justify-center gap-2 rounded-[12px] sm:h-[160px] sm:w-[260px] lg:h-[200px] lg:w-[320px]">
          <Languages aria-hidden className="size-8 text-brand-600" />
          <span className="text-[26px] font-semibold uppercase tracking-[0.06em] text-foreground/80">{shown ? getBaseLanguage(shown) : "?"}</span>
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
      result={<Trans>The book is edited and published in this language. Pick another one only if you want the text translated into it.</Trans>}
      changed={changed}
      badge={!!found}
      labelId="gd-language"
      open={open}
      onToggle={() => setOpen((o) => !o)}
      others
      othersLabel={<Trans>Choose another language</Trans>}
    >
      <div className="flex flex-col gap-2 rounded-[14px] bg-[var(--lc-bubble)] p-3">
        <LanguagePicker label={i18n._(PICKER_LABEL)} selected={picked ?? ""} onSelect={(code) => form.setFieldValue("editingLanguage", code)} size="default" />
        {picked && (
          <button type="button" onClick={() => form.setFieldValue("editingLanguage", "")} className="lc-link self-start px-1 text-[13.5px] font-medium">
            <Trans>Keep the book&apos;s own language</Trans>
          </button>
        )}
      </div>
    </SurePick>
  )
}
