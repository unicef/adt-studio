import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { ArrowLeft, Check as CheckIcon, Sparkles, Wrench } from "lucide-react"
import type { SetupRecommendation } from "@adt/types"
import { cn } from "@/lib/utils"
import { useCreate } from "./nameField"
import { PrimaryButton } from "../../../core/ui"
import { LC_PRIMARY } from "../shared/Create"
import type { Answers } from "../shared/useAnswers"
import { ActivitiesScreen } from "./screens/ActivitiesScreen"
import { KindScreen } from "./screens/KindScreen"
import { LanguageScreen } from "./screens/LanguageScreen"
import { LookScreen } from "./screens/LookScreen"
import { NameScreen } from "./screens/NameScreen"
import { PagesScreen } from "./screens/PagesScreen"
import { SpreadsScreen } from "./screens/SpreadsScreen"
import { activityFacts, screenFacts, screenSure, type ScreenId } from "./screens"
import type { Check } from "./useCheck"
import { screenTitle } from "./words"

const HEADING = "gd-check-title"

/** Enter moves on unless focus is in a field or on something Enter already presses. */
// eslint-disable-next-line lingui/no-unlocalized-strings -- a CSS selector
const OWN_ENTER = "input, textarea, select, button, a[href], [role='slider'], [role='switch'], [contenteditable='true']"

type Props = {
  rec: SetupRecommendation
  chat: Answers
  check: Check
  values: Record<string, string>
  file: File | null | undefined
  pageCount: number
  locked: boolean
  onCreate: () => void
  onManual: () => void
}

/**
 * Check, one small screen at a time: the screen's heading, its one decision (or two that belong
 * together), then Back, the screen's button ("Looks right" when the engine is sure, "Continue"
 * when it asked) and "Skip to the end with my picks". The last screen creates the book. Focus
 * moves to the heading of each new screen; Enter presses the screen's button.
 */
export function CheckFlow({ rec, chat, check, values, file, pageCount, locked, onCreate, onManual }: Props) {
  const { i18n } = useLingui()
  const derived = chat.derived!
  const facts = activityFacts(rec, derived.current)
  const { at, screens } = check
  const index = screens.indexOf(at)
  const last = at === "name"
  // Pages is the user's own pick, so it just continues; the others are sure unless the engine asked.
  const sure = at !== "pages" && screenSure(rec, derived.current, at)
  const create = useCreate(onCreate)
  const heading = useRef<HTMLHeadingElement>(null)
  const moved = useRef(false)
  // The space kept under the content is the bar's own height (less the page's own bottom padding, 24px), so a page that fits never scrolls.
  const bar = useRef<HTMLDivElement>(null)
  const [barH, setBarH] = useState(88)
  useLayoutEffect(() => {
    const el = bar.current
    if (!el) return
    const fit = () => setBarH(Math.max(0, el.offsetHeight - 12))
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  // Which way the flow went, so the new screen slides in from that side.
  const way = useRef<{ at: ScreenId; index: number; dir: "next" | "back" }>({ at, index, dir: "next" })
  if (way.current.at !== at) way.current = { at, index, dir: index >= way.current.index ? "next" : "back" }
  const dir = way.current.dir

  const primary = () => {
    if (locked) return
    if (last) return create()
    // The answers on this screen are settled now (the guess, unless another was picked).
    for (const f of screenFacts(rec, derived.current, at)) if (f.ask && !(f.id in chat.answers)) chat.answer(f.id, derived.current[f.id])
    check.next()
  }

  // A new screen: focus its heading (not on the first one, which comes in with the step).
  useEffect(() => {
    if (!moved.current) {
      moved.current = true
      return
    }
    heading.current?.focus({ preventScroll: true })
    heading.current?.scrollIntoView({ block: "nearest" })
  }, [at])

  const press = useRef(primary)
  press.current = primary
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || e.defaultPrevented || e.isComposing || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return
      const target = e.target as HTMLElement | null
      if (target?.closest(OWN_ENTER)) return
      e.preventDefault()
      press.current()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  let body: ReactNode = null
  if (at === "kind") body = <KindScreen rec={rec} chat={chat} file={file} />
  else if (at === "language") body = <LanguageScreen rec={rec} />
  else if (at === "look") body = <LookScreen rec={rec} chat={chat} file={file} />
  else if (at === "spreads") body = <SpreadsScreen rec={rec} chat={chat} file={file} />
  else if (at === "pages") body = <PagesScreen pageCount={pageCount} />
  else if (at === "activities") body = <ActivitiesScreen rec={rec} chat={chat} file={file} />
  else body = <NameScreen facts={facts} screens={screens} values={values} settings={derived.effective} onEdit={(s) => check.go(s, true)} />

  return (
    <section aria-labelledby={HEADING} inert={locked} className="flex flex-col">
      <div key={at} data-dir={dir} className="gd-screen-in -mx-2 flex flex-col gap-3 px-2 pb-2 pt-1 lg:gap-4">
        {/* The decision leads: the screen's name is for screen readers, and the count and switch live in the bottom bar. */}
        <h2 id={HEADING} ref={heading} tabIndex={-1} className="sr-only">
          {i18n._(screenTitle(at, facts))}
        </h2>
        {body}
      </div>
      {/* The bar stays at the bottom of the window, so the button never moves; the space above keeps it off the content. */}
      <div aria-hidden style={{ height: barH }} />
      <div ref={bar} className="gd-bar fixed inset-x-0 bottom-0 z-20 border-t border-border bg-[var(--lc-bg)]/95 backdrop-blur-sm">
        <div className="mx-auto flex w-full max-w-[760px] flex-wrap items-center justify-between gap-x-6 lg:max-w-[880px] gap-y-3 px-4 py-4 sm:px-6">
          {/* Where you are: this screen, the steps of Check as segments, and the count. */}
          <div className="flex min-w-0 flex-col gap-1.5">
            <span className="flex items-baseline gap-2 text-[14px]">
              <span key={at} data-dir={dir} className="gd-bar-in font-semibold">
                {i18n._(screenTitle(at, facts))}
              </span>
              <span key={`n-${at}`} data-dir={dir} className="gd-bar-in tabular-nums text-muted-foreground">
                <Trans>
                  {index + 1} of {screens.length}
                </Trans>
              </span>
            </span>
            <span aria-hidden className="flex gap-1">
              {screens.map((s, i) => (
                <span key={s} className="relative h-1 w-7 overflow-hidden rounded-full bg-border">
                  <span className={cn("gd-seg absolute inset-0 origin-left rounded-full bg-[var(--gd-step)]", i < index || check.done.includes(s) ? "scale-x-100 opacity-100" : s === at ? "scale-x-100 opacity-45" : "scale-x-0 opacity-100")} />
                </span>
              ))}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {last ? (
              <button type="button" onClick={onManual} className="lc-link inline-flex min-h-11 items-center gap-1.5 px-3 text-[13.5px] font-medium">
                <Wrench className="size-4" />
                <Trans>Choose every setting myself</Trans>
              </button>
            ) : (
              !check.returning && (
                <button type="button" onClick={check.end} className="hidden min-h-11 items-center rounded-full px-3 text-[13.5px] text-muted-foreground underline decoration-border underline-offset-4 transition-colors hover:text-foreground sm:inline-flex">
                  <Trans>Skip to the end</Trans>
                </button>
              )
            )}
            {index > 0 && (
              <button type="button" onClick={check.back} className="gd-bar-in inline-flex min-h-11 items-center gap-1.5 rounded-[12px] px-3.5 text-[14.5px] font-medium ring-1 ring-border transition-colors hover:bg-[var(--lc-bubble)]">
                <ArrowLeft className="size-4" />
                <Trans>Back</Trans>
              </button>
            )}
            <PrimaryButton
              onClick={primary}
              disabled={locked}
              icon={last ? <Sparkles className="size-4" /> : sure ? <CheckIcon className="size-4" /> : undefined}
              className={cn(LC_PRIMARY, "min-w-[148px] lg:h-12 lg:min-w-[168px] lg:px-7 lg:text-[15.5px]")}
            >
              <span key={last ? "last" : check.returning ? "return" : sure ? "sure" : "go"} className="gd-bar-in">
                {last ? <Trans>Set up book</Trans> : check.returning ? <Trans>Back to the summary</Trans> : sure ? <Trans>Looks right</Trans> : <Trans>Continue</Trans>}
              </span>
            </PrimaryButton>
          </div>
        </div>
      </div>
    </section>
  )
}

