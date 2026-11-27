import { useContext, useEffect, useRef, useState, type ReactNode } from "react"
import { LanguageLookContext } from "./languageLook"
import { Check, Languages, Search } from "lucide-react"
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

/** One variety: a radio styled as a chip. Chosen, it fills with the brand colour and shows a tick. */
function VarietyChip({ label, on, note, onPick }: { label: ReactNode; on: boolean; note?: ReactNode; onPick: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      tabIndex={on ? 0 : -1}
      onClick={onPick}
      className={cn(
        "inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[13.5px] font-medium ring-1 transition-[background-color,color,box-shadow,transform] duration-150 active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 motion-reduce:transition-none",
        on ? "bg-brand-600 text-white shadow-[0_4px_12px_-6px_rgba(43,127,255,0.7)] ring-brand-600" : "bg-card text-foreground ring-foreground/15 hover:bg-brand-50 hover:ring-brand-300",
      )}
    >
      {on && <Check aria-hidden className="size-3.5 stroke-[3] animate-in zoom-in-50 duration-200 motion-reduce:animate-none" />}
      {label}
      {note && <span className={cn("text-[11.5px] font-normal", on ? "text-white/80" : "text-muted-foreground")}>{note}</span>}
    </button>
  )
}

/** Arrow keys move between the radios of a group (and pick, as radio groups do); Tab leaves it. */
function onRadioKeys(e: React.KeyboardEvent<HTMLElement>) {
  const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0
  if (!step) return
  const radios = [...e.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]')]
  const i = radios.indexOf(document.activeElement as HTMLElement)
  const next = radios[(i + step + radios.length) % radios.length]
  if (!next) return
  e.preventDefault()
  next.focus()
  next.click()
}

/**
 * Which variety of the language (Brazil or Portugal, Spain or Mexico…), as one choice: the one
 * found in the book first, then the usual ones; "Not sure" when the book didn't tell. More opens
 * the language's other varieties with a search, right there. Only real varieties of the language
 * are offered (no "Portuguese (Spain)"). Picking one sets the spelling and the voices; the book
 * isn't translated.
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
  const varieties = getCountriesForLanguage(base).suggested
  if (varieties.length < 2) return null
  const now = region(code)
  const fromBook = found && getBaseLanguage(found) === base ? region(found) : null
  const foundNote = source === "ai" ? <Trans>from the pages</Trans> : <Trans>from the PDF</Trans>
  // A fixed order (the one found first, then the usual ones, then a pick from More), so nothing moves under the pointer.
  const shown = [...new Set([fromBook, ...varieties.slice(0, 5).map((c) => c.code), now].filter((c): c is string => !!c))]
  const pick = (country: string) => {
    onPick(`${base}-${country.toUpperCase()}`)
    setMore(false)
    setQuery("")
  }
  // More: the language's other varieties, filtered by a search on their names (interface language or English).
  const q = query.trim().toLocaleLowerCase(i18n.locale)
  const rest = varieties.filter((c) => !shown.includes(c.code) && (!q || regionName(c.code, i18n.locale).toLocaleLowerCase(i18n.locale).includes(q) || c.name.toLowerCase().includes(q)))
  const hidden = varieties.length - shown.filter((c) => varieties.some((v) => v.code === c)).length
  return (
    <div className="mt-1 flex flex-col gap-2">
      <div>
        <p id="gd-variety" className="text-[14px] font-semibold">
          <Trans>Which variety?</Trans>
        </p>
        <p className="text-[13px] text-muted-foreground">
          <Trans>Sets the spelling and the voices. The book isn&apos;t translated.</Trans>
        </p>
      </div>
      <div role="radiogroup" aria-labelledby="gd-variety" onKeyDown={onRadioKeys} className="flex flex-wrap items-center gap-1.5">
        {!fromBook && <VarietyChip label={<Trans>Not sure</Trans>} on={!now} onPick={() => onPick("")} />}
        {shown.map((c) => (
          <VarietyChip key={c} label={regionName(c, i18n.locale)} on={c === now} note={c === fromBook ? foundNote : undefined} onPick={() => pick(c)} />
        ))}
        {hidden > 0 && (
          <button type="button" aria-expanded={more} onClick={() => setMore((m) => !m)} className="lc-link h-9 px-2 text-[13.5px] font-medium">
            {more ? <Trans>Fewer</Trans> : <Trans>More ({hidden})</Trans>}
          </button>
        )}
      </div>
      <Collapsible shown={more}>
        <div ref={panel} inert={!more} className="mt-1 flex flex-col gap-2.5 rounded-[14px] bg-[var(--lc-bubble)] p-3 ring-1 ring-border">
          {hidden > 8 && (
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
          )}
          {rest.length > 0 ? (
            <div role="radiogroup" aria-labelledby="gd-variety" onKeyDown={onRadioKeys} className="flex flex-wrap gap-1.5">
              {rest.map((c) => (
                <VarietyChip key={c.code} label={regionName(c.code, i18n.locale)} on={false} onPick={() => pick(c.code)} />
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

/** The language's name in itself ("English", "Português (Brasil)"), the way a speaker would know it. */
function endonym(code: string): string {
  try {
    const name = new Intl.DisplayNames([code], { type: "language", languageDisplay: "standard" }).of(code) ?? code
    return name.charAt(0).toLocaleUpperCase(code) + name.slice(1)
  } catch {
    return code
  }
}

/** The language as a big mark: its code ("EN"), the variety's country code under it ("US"). */
function CodeMark({ code, size }: { code: string | null; size: "stamp" | "tile" }) {
  const base = code ? getBaseLanguage(code).toUpperCase() : "?"
  const country = region(code)?.toUpperCase()
  return (
    <span className={cn("flex shrink-0 flex-col items-center justify-center bg-brand-50 text-brand-700 ring-1 ring-brand-200", size === "tile" ? "size-[72px] rounded-[20px] lg:size-[84px]" : "size-[64px] rounded-[18px]")}>
      <span className={cn("font-extrabold leading-none tracking-[0.02em]", size === "tile" ? "text-[28px] lg:text-[32px]" : "text-[24px]")}>{base}</span>
      {country && <span className="mt-1 rounded-full bg-brand-600 px-1.5 text-[10.5px] font-bold leading-[16px] text-white">{country}</span>}
    </span>
  )
}

/** The stamp over the illustration: the code mark beside the language's own name. */
function LanguageStamp({ code }: { code: string | null }) {
  return (
    <span className="relative z-10 -mt-3 flex shrink-0 items-center gap-3 rounded-[22px] bg-card py-2 pl-2 pr-5 shadow-[0_14px_34px_-16px_rgba(15,23,42,0.45)] ring-1 ring-border animate-in fade-in slide-in-from-bottom-2 duration-500 motion-reduce:animate-none">
      <CodeMark code={code} size="stamp" />
      <span className="text-left text-[17px] font-semibold leading-tight">{code ? endonym(code) : "?"}</span>
    </span>
  )
}

/** The variety choice in its own card, so it reads as part of the answer. */
function VarietyCard({ children }: { children: ReactNode }) {
  return <div className="rounded-[18px] bg-[var(--lc-bubble)] p-4 shadow-[var(--lc-shadow)] lg:p-5">{children}</div>
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
  const look = useContext(LanguageLookContext)
  const name = shown ? nameOf(shown, true) : <Trans>The book&apos;s own language</Trans>
  const varieties = shown && !changed ? <VarietyChips code={shown} found={found} source={source} onPick={(code) => form.setFieldValue("editingLanguage", code)} /> : null
  return (
    <SurePick
      picture={
        look === "tile" ? null : (
          look === "stamp" ? (
            // The illustration, smaller, with the stamp under it (overlapping its foot), both in view.
            <span className={`flex shrink-0 flex-col items-center justify-center p-2 ${PICTURE}`}>
              <span className="grid min-h-0 w-full flex-1 place-items-center [&_img]:max-h-full">
                <LanguagePicture code={shown ? getBaseLanguage(shown) : null} outputs={outputs.map(getBaseLanguage)} codeBadge={false} />
              </span>
              <LanguageStamp code={shown} />
            </span>
          ) : (
            <span className={`relative grid shrink-0 place-items-center p-3 ${PICTURE}`}>
              <LanguagePicture code={shown ? getBaseLanguage(shown) : null} outputs={outputs.map(getBaseLanguage)} />
            </span>
          )
        )
      }
      pictureSize={look === "stamp" ? "compact" : "full"}
      label={<Trans>Language of the book</Trans>}
      title={
        look === "tile" ? (
          <span className="flex items-center gap-4">
            <CodeMark code={shown} size="tile" />
            <span className="flex flex-col">
              {name}
              {/* Its own name, when that reads differently from the interface's ("Português (Brasil)" under "Portuguese (Brazil)"). */}
              {shown && endonym(shown).toLocaleLowerCase() !== String(nameOf(shown, true)).toLocaleLowerCase() && <span className="text-[15px] font-normal tracking-normal text-muted-foreground lg:text-[16px]">{endonym(shown)}</span>}
            </span>
          </span>
        ) : (
          name
        )
      }
      after={look !== "now" && varieties ? <VarietyCard>{varieties}</VarietyCard> : undefined}
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
      result={
        <span className="flex flex-col items-start gap-1">
          {look === "now" && (
            <span>
              <Trans>The book stays in this language.</Trans>
            </span>
          )}
          {look === "now" && varieties}
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
