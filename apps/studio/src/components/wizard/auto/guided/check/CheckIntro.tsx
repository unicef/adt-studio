import type { ReactNode } from "react"
import { useStore } from "@tanstack/react-form"
import { Plural, Trans, useLingui } from "@lingui/react/macro"
import { ArrowRight, Check, CircleHelp } from "lucide-react"
import type { SetupRecommendation } from "@adt/types"
import { getBaseLanguage } from "@/lib/languages"
import { cn } from "@/lib/utils"
import { PageThumb } from "../../../core/fields/ScopeField"
import { PrimaryButton } from "../../../core/ui"
import { useWizardForm } from "../../../core/wizardForm"
import { factArt, LanguageArt } from "../shared/art/ConceptArt"
import { LC_PRIMARY } from "../shared/Create"
import { lookOf } from "../shared/screens/look"
import type { Answers } from "../shared/useAnswers"
import { bookLanguage, screenFacts, screenSure, type ScreenId } from "./screens"
import { Picture } from "./SurePick"
import type { Check as CheckState } from "./useCheck"
import { SCREEN_TITLE } from "./words"

type Props = { rec: SetupRecommendation; chat: Answers; check: CheckState; values: Record<ScreenId, string>; file: File | null | undefined; pageCount: number; locked: boolean }

/**
 * Check's opening: one card per decision with what was found and whether it needs the user, so
 * the screens that follow aren't a surprise. "Go through them" opens the first screen; "Skip to
 * the name" takes every pick (the guesses for what was asked) and opens the last one.
 */
export function CheckIntro({ rec, chat, check, values, file, pageCount, locked }: Props) {
  const { i18n } = useLingui()
  const derived = chat.derived!
  const screens = check.screens.filter((s) => s !== "name")
  const ask = screens.filter((s) => s !== "pages" && !screenSure(rec, derived.current, s))
  const art = (s: ScreenId): ReactNode => {
    if (s === "kind") return factArt("genre", derived.current.genre)
    if (s === "language") {
      const code = bookLanguage(rec)
      return <LanguageArt code={code ? getBaseLanguage(code) : null} outputs={[]} />
    }
    if (s === "look") return <Picture rec={rec} look={lookOf(derived.effective)} page={rec.previewPage} file={file} className="h-full w-full" />
    if (s === "pages") return <Pages file={file} pageCount={pageCount} />
    const fact = screenFacts(rec, derived.current, "activities")[0]
    return fact ? factArt(fact.id, derived.current[fact.id]) : null
  }
  return (
    <section aria-labelledby="gd-intro-title" inert={locked} className="flex flex-col gap-4 lg:gap-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-1">
        <h2 id="gd-intro-title" className="text-[19px] font-semibold tracking-[-0.015em] lg:text-[24px]">
          <Trans>What I found</Trans>
        </h2>
        <span className="text-[13px] text-muted-foreground lg:text-[14.5px]">
          <Plural value={check.screens.length} one="# quick step" other="# quick steps" />
        </span>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 lg:gap-4">
        {screens.map((s, i) => {
          const sure = s === "pages" || screenSure(rec, derived.current, s)
          const unknown = s === "language" && !bookLanguage(rec)
          return (
            <li key={s} className="lc-surface flex flex-row items-center gap-3 p-3 sm:flex-col sm:items-stretch lg:p-4">
              <span className="qd18-pv grid h-[84px] w-[112px] shrink-0 place-items-center overflow-hidden rounded-[12px] p-1.5 sm:h-[130px] sm:w-auto sm:p-2 lg:h-[clamp(120px,17vh,210px)]">{art(s)}</span>
              <span className="flex min-w-0 flex-col gap-1 px-1">
                <span className="text-[12.5px] text-muted-foreground lg:text-[13.5px]">
                  {i + 1}. {i18n._(SCREEN_TITLE[s])}
                </span>
                <span className="text-[15.5px] font-semibold leading-tight lg:text-[17px]">{values[s]}</span>
                <span className={cn("mt-1 inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-medium", s === "pages" || unknown ? "bg-muted text-muted-foreground" : sure ? "bg-[var(--gd-step)] text-primary-foreground" : "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300")}>
                  {s === "pages" ? <Trans>You pick</Trans> : unknown ? <Trans>Not found in the PDF</Trans> : sure ? (
                    <>
                      <Check className="size-3 stroke-[3]" />
                      <Trans>I&apos;m sure</Trans>
                    </>
                  ) : (
                    <>
                      <CircleHelp className="size-3" />
                      <Trans>Needs you</Trans>
                    </>
                  )}
                </span>
              </span>
            </li>
          )
        })}
      </ul>
      <div className="flex flex-col items-end gap-1 pt-1">
        <PrimaryButton onClick={check.begin} disabled={locked} icon={<ArrowRight className="size-4" />} className={cn(LC_PRIMARY, "min-w-[148px] lg:h-12 lg:px-7 lg:text-[15.5px]")}>
          {ask.length ? <Trans>Go through them</Trans> : <Trans>Check them one by one</Trans>}
        </PrimaryButton>
        <button type="button" onClick={check.end} className="-mr-2 inline-flex min-h-10 items-center rounded-full px-3 text-[13.5px] text-muted-foreground underline decoration-border underline-offset-4 transition-colors hover:text-foreground">
          {ask.length ? <Trans>Use my guesses and skip to the name</Trans> : <Trans>All good, skip to the name</Trans>}
        </button>
      </div>
    </section>
  )
}

function Pages({ file, pageCount }: { file: File | null | undefined; pageCount: number }) {
  const form = useWizardForm()
  const scope = useStore(form.store, (s) => s.values.scope)
  const start = parseInt(useStore(form.store, (s) => s.values.startPage)) || 1
  const end = parseInt(useStore(form.store, (s) => s.values.endPage)) || pageCount
  return (
    <span className="flex origin-center scale-[0.45] items-center gap-3 sm:scale-100">
      <PageThumb file={file ?? null} page={scope === "range" ? start : 1} />
      <ArrowRight aria-hidden className="size-4 text-muted-foreground" />
      <PageThumb file={file ?? null} page={scope === "range" ? end : pageCount} />
    </span>
  )
}

/** The assistant's line over the overview: it has read the book, and how much needs the user. */
export function IntroSays({ rec, chat, check }: Pick<Props, "rec" | "chat" | "check">) {
  const derived = chat.derived!
  const ask = check.screens.filter((s) => s !== "name" && s !== "pages" && !screenSure(rec, derived.current, s)).length
  return (
    <p>
      <strong className="font-semibold">
        <Trans>I&apos;ve read your book.</Trans>
      </strong>{" "}
      {ask === 0 ? (
        <Trans>Here&apos;s how I&apos;d set it up. I&apos;m sure of all of it; you only pick the pages and the name.</Trans>
      ) : (
        <Plural value={ask} one="Here's how I'd set it up. I'm sure of most of it, but # thing needs you." other="Here's how I'd set it up. I'm sure of most of it, but # things need you." />
      )}
    </p>
  )
}
