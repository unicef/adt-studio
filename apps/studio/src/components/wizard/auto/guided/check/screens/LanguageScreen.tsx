import { useState } from "react"
import { useStore } from "@tanstack/react-form"
import { Trans } from "@lingui/react/macro"
import type { SetupRecommendation } from "@adt/types"
import { getBaseLanguage } from "@/lib/languages"
import { cn } from "@/lib/utils"
import { useLanguageName } from "../../shared/languageName"
import { useWizardForm } from "../../../../core/wizardForm"
import { bookLanguage } from "../screens"
import { LanguageBook } from "../../shared/art/LanguageBook"
import { PICTURE, SurePick } from "../SurePick"
import { LanguageHelp } from "./LanguageHelp"
import { useExplain } from "../../shared/explain"
import { endonym, LanguageChoice, region } from "./LanguageChoice"

/**
 * The language the book will be made in: the user's pick, or the book's own (null when nothing
 * tells), which may carry its variety ("pt-BR"). `changed`: another language, so the book is
 * translated; `variety`: the same language in a variety the user picked (never translated: the
 * pipeline translates only when the base language differs).
 */
export function useBookLanguage(rec: SetupRecommendation): { found: string | null; picked: string | null; changed: boolean; variety: boolean } {
  const form = useWizardForm()
  const editing = useStore(form.store, (s) => s.values.editingLanguage).trim()
  const found = bookLanguage(rec)
  const picked = editing || null
  const same = !!picked && !!found && getBaseLanguage(picked) === getBaseLanguage(found)
  return { found, picked, changed: !!picked && !same, variety: same }
}

/** The language as a stamp: a big code mark ("EN", the variety's country "US" under it) beside the language's own name. */
function LanguageStamp({ code }: { code: string | null }) {
  const base = code ? getBaseLanguage(code).toUpperCase() : "?"
  const country = region(code)?.toUpperCase()
  return (
    <span key={code ?? "none"} className="absolute bottom-[3%] left-[3%] z-20 flex items-center gap-3 rounded-[20px] bg-card p-1.5 sm:pr-4 shadow-[0_14px_34px_-16px_rgba(15,23,42,0.45)] ring-1 ring-border animate-in fade-in slide-in-from-bottom-2 duration-500 motion-reduce:animate-none">
      <span className="flex size-[52px] shrink-0 flex-col items-center justify-center rounded-[15px] bg-brand-50 text-brand-700 ring-1 ring-brand-200 lg:size-[60px]">
        <span className="text-[20px] font-extrabold leading-none tracking-[0.02em] lg:text-[23px]">{base}</span>
        {country && <span className="mt-1 rounded-full bg-brand-600 px-1.5 text-[10px] font-bold leading-[15px] text-white">{country}</span>}
      </span>
      <span className="text-left text-[15px] font-semibold leading-tight max-sm:hidden lg:text-[16.5px]">{code ? endonym(code) : "?"}</span>
    </span>
  )
}

/**
 * Screen 2 · Language: the language found in the book, as a sure pick. The picture is the book in
 * that language (its words, in its bubbles) with a stamp naming it; under the pick, its variety
 * (the spelling and the voices, never a translation) and Another language, in a floating picker
 * (language first, then variety). The editing language stays empty unless the user picks, so a
 * wrong guess can never translate the book; a variety of the same language never translates.
 */
export function LanguageScreen({ rec }: { rec: SetupRecommendation }) {
  const form = useWizardForm()
  const [help, setHelp] = useState(false)
  // The assistant's bubble offers this explanation ("Not sure? I can explain ...").
  useExplain("languages", () => setHelp(true))
  const { found, picked, changed, variety } = useBookLanguage(rec)
  const nameOf = useLanguageName()
  const shown = picked ?? found
  const source = rec.language?.source
  // Picking the language found in the book (as it was found) is the same as picking nothing.
  const pick = (code: string) => form.setFieldValue("editingLanguage", code === found ? "" : code)
  return (
    <SurePick
      picture={
        <span className={cn("relative grid shrink-0 place-items-center p-2", PICTURE)}>
          <LanguageBook code={shown} />
          <LanguageStamp code={shown} />
        </span>
      }
      label={<Trans>Language of the book</Trans>}
      title={shown ? nameOf(shown, true) : <Trans>The book&apos;s own language</Trans>}
      hint={
        changed ? (
          <Trans>Your pick. The text is translated into it.</Trans>
        ) : variety ? (
          <Trans>Your pick.</Trans>
        ) : !found ? (
          <Trans>I couldn&apos;t tell from the PDF. It&apos;s found when the pages are read.</Trans>
        ) : source === "ai" ? (
          <Trans>Read on the pages.</Trans>
        ) : (
          <Trans>Found in the PDF&apos;s text.</Trans>
        )
      }
      result={<LanguageHelp open={help} onOpenChange={setHelp} found={found ? nameOf(found) : null} />}
      after={
        <div className="rounded-[18px] bg-[var(--lc-bubble)] p-4 shadow-[var(--lc-shadow)] lg:p-5">
          <LanguageChoice code={shown} found={found} source={source} onPick={pick} />
        </div>
      }
      changed={changed || variety}
      badge={!!found}
      labelId="gd-language"
      open={false}
      onToggle={() => {}}
      others={false}
    />
  )
}
