import { useEffect, useRef, type ReactNode } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { ArrowLeft, Check as CheckIcon, Sparkles, Wrench } from "lucide-react"
import type { SetupRecommendation } from "@adt/types"
import { cn } from "@/lib/utils"
import { useCreate } from "./nameField"
import { PrimaryButton } from "../../../core/ui"
import { LC_PRIMARY } from "../shared/Create"
import type { Answers } from "../shared/useAnswers"
import { Morph } from "../Morph"
import { ActivitiesScreen } from "./screens/ActivitiesScreen"
import { KindScreen } from "./screens/KindScreen"
import { LanguageScreen } from "./screens/LanguageScreen"
import { LookScreen } from "./screens/LookScreen"
import { NameScreen } from "./screens/NameScreen"
import { PagesScreen } from "./screens/PagesScreen"
import { screenFacts, screenSure } from "./screens"
import type { Check } from "./useCheck"
import { SCREEN_TITLE } from "./words"
import { useCheckLayout } from "../shared/checkLayout"
import { setWizardNames, useWizardNames } from "../shared/wizardNames"

const HEADING = "gd-check-title"

/** Enter moves on unless focus is in a field or on something Enter already presses. */
// eslint-disable-next-line lingui/no-unlocalized-strings -- a CSS selector
const OWN_ENTER = "input, textarea, select, button, a[href], [role='slider'], [role='switch'], [contenteditable='true'], [data-lab-toolbar]"

/** "Wizard names": shows each choice's settings as the step-by-step wizard names them. */
function NamesSwitch() {
  const on = useWizardNames()
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => setWizardNames(!on)}
      className="inline-flex min-h-9 items-center gap-2 rounded-full px-2 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
    >
      <span className={cn("relative inline-flex h-[18px] w-8 shrink-0 items-center rounded-full transition-colors duration-200", on ? "bg-[var(--lc-accent)]" : "bg-muted-foreground/30")}>
        <span className={cn("absolute left-0.5 size-3.5 rounded-full bg-white shadow transition-transform duration-200 motion-reduce:transition-none", on && "translate-x-3.5")} />
      </span>
      <Trans>Wizard names</Trans>
    </button>
  )
}

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
  const { at, screens } = check
  const layout = useCheckLayout()
  const lean = layout === "split" || layout === "focus"
  const index = screens.indexOf(at)
  const last = at === "name"
  // Pages is the user's own pick, so it just continues; the others are sure unless the engine asked.
  const sure = at !== "pages" && screenSure(rec, derived.current, at)
  const create = useCreate(onCreate)
  const heading = useRef<HTMLHeadingElement>(null)
  const moved = useRef(false)

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
  else if (at === "pages") body = <PagesScreen pageCount={pageCount} />
  else if (at === "activities") body = <ActivitiesScreen rec={rec} chat={chat} file={file} />
  else body = <NameScreen screens={screens} values={values} settings={derived.effective} onEdit={(s) => check.go(s, true)} />

  const meta = (
    <span className="flex shrink-0 items-center gap-4">
      <NamesSwitch />
      <span className="text-[13px] tabular-nums text-muted-foreground lg:text-[14.5px]">
        <Trans>
          {index + 1} of {screens.length}
        </Trans>
      </span>
    </span>
  )

  return (
    <section aria-labelledby={HEADING} inert={locked} className="flex flex-col">
      <Morph swap={at} name="gd-screen" className="-mx-2" inner="flex flex-col gap-3 px-2 pb-2 pt-1 lg:gap-4">
        {/* Split and focus let the decision lead: the screen's name is only for screen readers, and the count and switch move to the bottom bar. */}
        <div className={cn("flex items-baseline justify-between gap-3 px-1", lean && "sr-only")}>
          <h2 id={HEADING} ref={heading} tabIndex={-1} className="rounded-md text-[19px] font-semibold lg:text-[24px] tracking-[-0.015em] outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60">
            {i18n._(SCREEN_TITLE[at])}
          </h2>
          {!lean && meta}
        </div>
        {body}
      </Morph>
      <div className={cn("gd-foot sticky bottom-0 z-10 -mx-2 flex flex-col gap-1 px-2 pb-4 pt-5", layout === "focus" && "mt-4 border-t border-border pt-4")}>
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-4">
            {index > 0 ? (
              <button type="button" onClick={check.back} className="lc-link -ml-2 inline-flex min-h-11 items-center gap-1.5 px-3 text-[14.5px] font-medium">
                <ArrowLeft className="size-4" />
                <Trans>Back</Trans>
              </button>
            ) : (
              !lean && <span />
            )}
            {lean && meta}
          </span>
          <PrimaryButton
            onClick={primary}
            disabled={locked}
            icon={last ? <Sparkles className="size-4" /> : sure ? <CheckIcon className="size-4" /> : undefined}
            className={cn(LC_PRIMARY, "min-w-[148px] lg:h-12 lg:min-w-[176px] lg:px-7 lg:text-[15.5px]")}
          >
            {last ? <Trans>Set up book</Trans> : check.returning ? <Trans>Back to the summary</Trans> : sure ? <Trans>Looks right</Trans> : <Trans>Continue</Trans>}
          </PrimaryButton>
        </div>
        <div className="flex justify-end">
          {last ? (
            <button type="button" onClick={onManual} className="lc-link -mr-2 inline-flex min-h-10 items-center gap-1.5 px-3 text-[13.5px] font-medium">
              <Wrench className="size-4" />
              <Trans>Set it up myself</Trans>
            </button>
          ) : (
            !check.returning && (
              <button type="button" onClick={check.end} className="-mr-2 inline-flex min-h-10 items-center rounded-full px-3 text-[13.5px] text-muted-foreground underline decoration-border underline-offset-4 transition-colors hover:text-foreground">
                <Trans>Skip to the end with my picks</Trans>
              </button>
            )
          )}
        </div>
      </div>
    </section>
  )
}
