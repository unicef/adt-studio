import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { ArrowLeft, Check, ChevronRight, Search } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { getBaseLanguage, getCountriesForLanguage, matchesSearch, SUPPORTED_LANGUAGES } from "@/lib/languages"
import { cn } from "@/lib/utils"
import { languageName, regionName } from "../../shared/languageName"
import { useReturnFocus } from "../../shared/useReturnFocus"
import { useSwapName } from "../../shared/motion"
import { inItself, ownName } from "../../shared/art/LanguageBook"

export const region = (code: string | null) => (code && code.includes("-") ? code.split("-")[1]!.toLowerCase() : null)

/** The language's name in itself ("Português (Brasil)"), the way a speaker would know it. */
export function endonym(code: string): string {
  const [lang = "", country] = code.split("-")
  // Names the browser may not know (Albanian's) come from the illustration's own list.
  const own = ownName(lang)
  if (own) return country ? `${own} (${inItself(lang, "region", country)})` : own
  try {
    const name = new Intl.DisplayNames([code], { type: "language", languageDisplay: "standard" }).of(code) ?? code
    return name.charAt(0).toLocaleUpperCase(code) + name.slice(1)
  } catch {
    return code
  }
}

/** One variety: a radio styled as a chip. Chosen, it fills with the brand colour and shows a tick. */
function VarietyChip({ label, on, tabbable = on, note, onPick }: { label: ReactNode; on: boolean; /** In the tab order: the checked one, or the first when none is. */ tabbable?: boolean; note?: ReactNode; onPick: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      tabIndex={tabbable ? 0 : -1}
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
function onRadioKeys(e: KeyboardEvent<HTMLElement>) {
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

/** How long the dialog takes to close (ui/dialog's duration-200), plus a frame. */
const DIALOG_CLOSE_MS = 220

const ROW = "flex w-full items-center gap-3 rounded-[10px] px-3 py-2 text-left text-[14px] transition-colors hover:bg-brand-50 focus-visible:bg-brand-50 focus-visible:outline-none"

/**
 * The language picker, in a dialog like the old language picker: first the language, then its
 * variety. It opens on the varieties of the language in use ("variety") or on the languages
 * ("language"); each list has a search.
 */
function LanguagePanel({ start, current, found, foundNote, onPick, onDone }: { start: "language" | "variety"; current: string | null; found: string | null; foundNote: ReactNode; onPick: (code: string) => void; onDone: () => void }) {
  const { i18n, t } = useLingui()
  const [step, setStep] = useState(start)
  const [lang, setLang] = useState(current ? getBaseLanguage(current) : (found ? getBaseLanguage(found) : "en"))
  const [query, setQuery] = useState("")
  const search = useRef<HTMLInputElement>(null)
  useEffect(() => {
    setQuery("")
    search.current?.focus({ preventScroll: true })
  }, [step])
  const q = query.trim().toLocaleLowerCase(i18n.locale)
  const nameOf = (code: string) => languageName(code, i18n.locale, true)
  // The dialog closes first, and the pick lands once it has gone, so the change morphs on the
  // page alone (a snapshot taken with the dialog fading out doubled the words and showed its ×).
  const pick = (code: string) => {
    onDone()
    window.setTimeout(() => onPick(code), DIALOG_CLOSE_MS)
  }

  if (step === "language") {
    const foundBase = found ? getBaseLanguage(found) : null
    const currentBase = current ? getBaseLanguage(current) : foundBase
    const list = SUPPORTED_LANGUAGES.map((l) => ({ code: l.code, name: nameOf(l.code), own: endonym(l.code), countries: l.countries?.length ?? 0 }))
      .filter((l) => matchesSearch(q, [l.name, l.own], i18n.locale) || l.code === q)
      .sort((a, b) => Number(b.code === foundBase) - Number(a.code === foundBase) || a.name.localeCompare(b.name, i18n.locale))
    return (
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1 pr-8">
          <DialogTitle className="text-[18px] font-bold tracking-[-0.01em]">
            <Trans>Choose the language</Trans>
          </DialogTitle>
          <DialogDescription className="text-[13.5px] text-muted-foreground">
            <Trans>Another language translates the book into it.</Trans>
          </DialogDescription>
        </div>
        <SearchBox ref={search} value={query} onChange={setQuery} placeholder={t`Search for a language`} />
        <ul className="-mx-1 h-[min(52vh,400px)] overflow-y-auto px-1">
          {list.map((l) => (
            <li key={l.code}>
              <button
                type="button"
                className={ROW}
                onClick={() => {
                  if (l.countries >= 2) {
                    setLang(l.code)
                    setStep("variety")
                  } else pick(l.code === foundBase && found ? found : l.code)
                }}
              >
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{l.name}</span>
                  {l.own.toLocaleLowerCase() !== l.name.toLocaleLowerCase() && <span className="ml-2 text-[13px] text-muted-foreground">{l.own}</span>}
                </span>
                {l.code === foundBase && <span className="shrink-0 text-[11.5px] text-muted-foreground">{foundNote}</span>}
                {l.code === currentBase && <Check aria-hidden className="size-4 shrink-0 text-brand-600" />}
                {l.countries >= 2 && <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground" />}
              </button>
            </li>
          ))}
          {list.length === 0 && (
            <li className="px-3 py-2 text-[13px] text-muted-foreground">
              <Trans>No language matches.</Trans>
            </li>
          )}
        </ul>
      </div>
    )
  }

  const varieties = getCountriesForLanguage(lang).suggested
  const now = current && getBaseLanguage(current) === lang ? region(current) : null
  const fromBook = found && getBaseLanguage(found) === lang ? region(found) : null
  const list = varieties.filter((c) => matchesSearch(q, [regionName(c.code, i18n.locale), c.name], i18n.locale))
  return (
    <div className="flex flex-col gap-3">
      <div className="-mb-1 -mt-1 flex items-center gap-1">
        <button type="button" onClick={() => setStep("language")} className="flex h-8 items-center gap-1 rounded-full px-2 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
          <ArrowLeft className="size-3.5" />
          <Trans>Another language</Trans>
        </button>
      </div>
      <div className="flex flex-col gap-1 pr-8">
        <DialogTitle className="text-[18px] font-bold tracking-[-0.01em]">
          <Trans>{nameOf(lang)}: which variety?</Trans>
        </DialogTitle>
        <DialogDescription className="text-[13.5px] text-muted-foreground">
          {found && getBaseLanguage(found) !== lang ? <Trans>Sets the spelling and the voices.</Trans> : <Trans>Sets the spelling and the voices. The book isn&apos;t translated.</Trans>}
        </DialogDescription>
      </div>
      {varieties.length > 8 && <SearchBox ref={search} value={query} onChange={setQuery} placeholder={t`Search for a country`} />}
      <ul className="-mx-1 h-[min(52vh,400px)] overflow-y-auto px-1">
        {!q && (
          <li>
            <button type="button" className={ROW} onClick={() => pick(lang)}>
              <span className="flex-1 font-medium">
                <Trans>Not sure</Trans>
              </span>
              {!now && current && getBaseLanguage(current) === lang && <Check aria-hidden className="size-4 text-brand-600" />}
            </button>
          </li>
        )}
        {list.map((c) => (
          <li key={c.code}>
            <button type="button" className={ROW} onClick={() => pick(`${lang}-${c.code.toUpperCase()}`)}>
              <span className="flex-1 font-medium">{regionName(c.code, i18n.locale)}</span>
              {c.code === fromBook && <span className="text-[11.5px] text-muted-foreground">{foundNote}</span>}
              {c.code === now && <Check aria-hidden className="size-4 text-brand-600" />}
            </button>
          </li>
        ))}
        {list.length === 0 && (
          <li className="px-3 py-2 text-[13px] text-muted-foreground">
            <Trans>No country matches.</Trans>
          </li>
        )}
      </ul>
    </div>
  )
}

function SearchBox({ ref, value, onChange, placeholder }: { ref: React.Ref<HTMLInputElement>; value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label className="relative flex items-center">
      <Search aria-hidden className="pointer-events-none absolute left-3 size-4 text-muted-foreground" />
      <span className="sr-only">{placeholder}</span>
      <input ref={ref} type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="h-9 w-full rounded-full bg-muted/60 pl-9 pr-3 text-[13.5px] outline-none ring-1 ring-transparent transition-shadow placeholder:text-muted-foreground focus:bg-card focus:ring-2 focus:ring-brand-400" />
    </label>
  )
}

/**
 * The language choice under the book's language: its varieties as one choice (the one found in
 * the book first, then the usual ones; "Not sure" when the book didn't tell), More for the rest,
 * and Another language. Both open the language dialog (language first, then variety), so the page
 * never grows or scrolls. A variety sets the spelling and the voices; another language translates.
 */
export function LanguageChoice({ code, found, source, onPick }: { code: string | null; found: string | null; source: string | null | undefined; onPick: (code: string) => void }) {
  const { i18n } = useLingui()
  const [panel, setPanel] = useState<"language" | "variety" | null>(null)
  const returnFocus = useReturnFocus(panel !== null)
  // Another language brings other varieties: the old row lifts away and the new one rises in.
  const chips = useSwapName<HTMLDivElement>("gd-varieties")
  const foundNote = source === "ai" ? <Trans>from the pages</Trans> : <Trans>from the PDF</Trans>
  const base = code ? getBaseLanguage(code) : null
  const varieties = base ? getCountriesForLanguage(base).suggested : []
  const now = region(code)
  const fromBook = found && base && getBaseLanguage(found) === base ? region(found) : null
  // A fixed order (the one found first, then the usual ones, then a pick from More), so nothing moves under the pointer.
  const shown = [...new Set([fromBook, ...varieties.slice(0, 5).map((c) => c.code), now].filter((c): c is string => !!c))]
  const hidden = varieties.filter((c) => !shown.includes(c.code)).length
  // Another language than the book's: the text is translated, so the variety line doesn't say it isn't.
  const translates = !!found && !!base && getBaseLanguage(found) !== base
  const pickVariety = (country: string) => onPick(`${base}-${country.toUpperCase()}`)
  return (
    <>
      <div className="flex flex-col gap-2">
        {varieties.length >= 2 && base && (
          <>
            <div>
              <p id="gd-variety" className="text-[14px] font-semibold">
                <Trans>Which variety?</Trans>
              </p>
              <p className="text-[13px] text-muted-foreground">
                {translates ? <Trans>Sets the spelling and the voices.</Trans> : <Trans>Sets the spelling and the voices. The book isn&apos;t translated.</Trans>}
              </p>
            </div>
            <div ref={chips} role="radiogroup" aria-labelledby="gd-variety" onKeyDown={onRadioKeys} className="flex flex-wrap items-center gap-1.5">
              {!fromBook && <VarietyChip label={<Trans>Not sure</Trans>} on={!now} onPick={() => onPick(base)} />}
              {shown.map((c, i) => (
                <VarietyChip key={c} label={regionName(c, i18n.locale)} on={c === now} tabbable={c === now || (!now && !!fromBook && i === 0)} note={c === fromBook ? foundNote : undefined} onPick={() => pickVariety(c)} />
              ))}
              {hidden > 0 && (
                <button type="button" aria-haspopup="dialog" aria-expanded={panel === "variety"} onClick={() => setPanel("variety")} className="lc-link h-9 px-2 text-[13.5px] font-medium">
                  <Trans>More ({hidden})</Trans>
                </button>
              )}
            </div>
          </>
        )}
        <button type="button" aria-haspopup="dialog" aria-expanded={panel === "language"} onClick={() => setPanel("language")} className="lc-link -ml-1.5 self-start px-1.5 py-1 text-[13.5px] font-medium">
          <Trans>Another language…</Trans>
        </button>
      </div>
      <Dialog open={panel !== null} onOpenChange={(o) => !o && setPanel(null)}>
        <DialogContent onCloseAutoFocus={returnFocus} className="flex max-h-[90vh] max-w-[min(94vw,460px)] flex-col gap-0 rounded-[24px] p-5 sm:p-6">
          {panel && <LanguagePanel key={panel} start={panel} current={code} found={found} foundNote={foundNote} onPick={onPick} onDone={() => setPanel(null)} />}
        </DialogContent>
      </Dialog>
    </>
  )
}
