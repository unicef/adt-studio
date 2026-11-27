import { useEffect, useRef, useState, type ReactNode } from "react"
import { Languages, Search } from "lucide-react"
import { useStore } from "@tanstack/react-form"
import { msg } from "@lingui/core/macro"
import { Trans, useLingui } from "@lingui/react/macro"
import type { SetupRecommendation } from "@adt/types"
import { LanguagePicker } from "@/components/LanguagePicker"
import { getBaseLanguage, getCountriesForLanguage } from "@/lib/languages"
import { Collapsible } from "@/components/ui/collapsible"
import { cn } from "@/lib/utils"
import { regionName, useLanguageName } from "../../shared/languageName"
import { useWizardForm } from "../../../../core/wizardForm"
import { bookLanguage } from "../screens"
import { LanguagePicture } from "../../shared/art/ConceptArt"
import { PICTURE, SurePick } from "../SurePick"
import { LanguageHelp } from "./LanguageHelp"
import { useExplain } from "../../shared/explain"

const PICKER_LABEL = msg`Translate the book into`

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

const region = (code: string | null) => (code && code.includes("-") ? code.split("-")[1]!.toLowerCase() : null)

/** One variety as a chip: its country, pressed when it's the one in use, "from the pages" when the reading found it. */
function VarietyChip({ country, on, found, onPick }: { country: string; on: boolean; found?: ReactNode; onPick: () => void }) {
  const { i18n } = useLingui()
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onPick}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium ring-1 transition-[background-color,box-shadow,transform] duration-150 active:scale-[0.97] motion-reduce:transition-none",
        on ? "bg-brand-50 text-brand-800 ring-brand-400" : "bg-card text-foreground ring-foreground/15 hover:bg-brand-50 hover:ring-brand-300",
      )}
    >
      {regionName(country, i18n.locale)}
      {found && <span className="text-[11.5px] font-normal text-muted-foreground">{found}</span>}
    </button>
  )
}

/**
 * Which variety of the language (Brazil or Portugal, Spain or Mexico…): the usual ones as chips, the
 * found one marked, and More, which opens every usual one plus a search for any country, right
 * there. Picking one only names the variety (voices, the spelling the AI writes in); the book isn't
 * translated.
 */
function VarietyChips({ code, found, source, onPick }: { code: string; found: string | null; source: string | null | undefined; onPick: (code: string) => void }) {
  const { i18n, t } = useLingui()
  const [more, setMore] = useState(false)
  const [query, setQuery] = useState("")
  const panel = useRef<HTMLDivElement>(null)
  const search = useRef<HTMLInputElement>(null)
  // Opened, the panel scrolls into view above the bottom bar and the search takes the focus.
  useEffect(() => {
    if (!more) return
    search.current?.focus({ preventScroll: true })
    const id = window.setTimeout(() => {
      const el = panel.current
      if (!el) return
      const bar = document.querySelector(".gd-bar")?.getBoundingClientRect().top ?? window.innerHeight
      const below = el.getBoundingClientRect().bottom + 16 - bar
      if (below > 0) scrollerOf(el)?.scrollBy({ top: below, behavior: "smooth" })
    }, 320)
    return () => window.clearTimeout(id)
  }, [more])
  const base = getBaseLanguage(code)
  const { suggested, all } = getCountriesForLanguage(base)
  if (suggested.length < 2) return null
  const now = region(code)
  const fromBook = found && getBaseLanguage(found) === base ? region(found) : null
  const foundNote = source === "ai" ? <Trans>from the pages</Trans> : <Trans>from the PDF</Trans>
  // A fixed order (the one found first, then the usual ones, then a pick from More), so nothing moves under the pointer.
  const shown = [...new Set([fromBook, ...suggested.slice(0, 5).map((c) => c.code), now].filter((c): c is string => !!c))]
  const pick = (country: string) => {
    onPick(`${base}-${country.toUpperCase()}`)
    setMore(false)
    setQuery("")
  }
  // More: the other usual varieties, or, while searching, any country whose name (in the interface language or English) matches.
  const q = query.trim().toLocaleLowerCase(i18n.locale)
  const pool = q ? [...suggested, ...all] : suggested.filter((c) => !shown.includes(c.code))
  const matches = pool.filter((c) => !q || regionName(c.code, i18n.locale).toLocaleLowerCase(i18n.locale).includes(q) || c.name.toLowerCase().includes(q)).slice(0, 30)
  return (
    <div className="flex flex-col gap-1.5" role="group" aria-label={t`Which variety?`}>
      <span className="text-[13px] text-muted-foreground">
        <Trans>Which variety?</Trans>
      </span>
      <div className="flex flex-wrap items-center gap-1.5">
        {shown.map((c) => (
          <VarietyChip key={c} country={c} on={c === now} found={c === fromBook ? foundNote : undefined} onPick={() => pick(c)} />
        ))}
        <button type="button" aria-expanded={more} onClick={() => setMore((m) => !m)} className="lc-link h-8 px-2 text-[13px] font-medium">
          {more ? <Trans>Fewer</Trans> : <Trans>More</Trans>}
        </button>
      </div>
      <Collapsible shown={more}>
        <div ref={panel} inert={!more} className="mt-1.5 flex flex-col gap-2.5 rounded-[14px] bg-[var(--lc-bubble)] p-3 ring-1 ring-border">
          <label className="relative flex items-center">
            <Search aria-hidden className="pointer-events-none absolute left-3 size-4 text-muted-foreground" />
            <span className="sr-only">
              <Trans>Search for a country</Trans>
            </span>
            <input
              ref={search}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t`Search for a country`}
              className="h-9 w-full rounded-full bg-card pl-9 pr-3 text-[13.5px] ring-1 ring-foreground/15 outline-none transition-shadow placeholder:text-muted-foreground focus:ring-2 focus:ring-brand-400"
            />
          </label>
          {matches.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {matches.map((c) => (
                <VarietyChip key={c.code} country={c.code} on={c.code === now} onPick={() => pick(c.code)} />
              ))}
            </div>
          ) : (
            <p className="px-1 text-[13px] text-muted-foreground">
              <Trans>No country matches.</Trans>
            </p>
          )}
        </div>
      </Collapsible>
    </div>
  )
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
  const { found, picked, changed, variety } = useBookLanguage(rec)
  const nameOf = useLanguageName()
  const foundName = found ? nameOf(found) : ""
  const outputs = useStore(form.store, (s) => s.values.outputLanguages)
  const shown = picked ?? found
  const source = rec.language?.source
  return (
    <SurePick
      picture={
        <span className={`grid shrink-0 place-items-center p-3 ${PICTURE}`}>
          <LanguagePicture code={shown ? getBaseLanguage(shown) : null} outputs={outputs.map(getBaseLanguage)} />
        </span>
      }
      label={<Trans>Language of the book</Trans>}
      title={shown ? nameOf(shown, true) : <Trans>The book&apos;s own language</Trans>}
      hint={
        changed ? (
          <Trans>Your pick. The text is translated into it.</Trans>
        ) : variety ? (
          <Trans>Your pick of variety. The book isn&apos;t translated.</Trans>
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
            <Trans>The book stays in this language.</Trans>
          </span>
          {shown && !changed && <VarietyChips code={shown} found={found} source={source} onPick={(code) => form.setFieldValue("editingLanguage", code)} />}
          <LanguageHelp open={help} onOpenChange={setHelp} found={found ? nameOf(found) : null} />
        </span>
      }
      changed={changed || variety}
      badge={!!found}
      labelId="gd-language"
      open={open}
      onToggle={() => setOpen((o) => !o)}
      others
      othersLabel={<Trans>Change the languages</Trans>}
      hideLabel={<Trans>Hide the languages</Trans>}
    >
      <div className="flex flex-col gap-3">
        <LangPart icon={<Languages className="size-4" />} title={i18n._(PICKER_LABEL)} hint={<Trans>Only if you want the whole book in another language.</Trans>}>
          <LanguagePicker label={i18n._(PICKER_LABEL)} selected={picked ?? ""} onSelect={(code) => form.setFieldValue("editingLanguage", code)} size="default" />
          {picked && (
            <button type="button" onClick={() => form.setFieldValue("editingLanguage", "")} className="lc-link self-start px-1 text-[13.5px] font-medium">
              {found ? <Trans>Keep {foundName}</Trans> : <Trans>Keep the book&apos;s own language</Trans>}
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
