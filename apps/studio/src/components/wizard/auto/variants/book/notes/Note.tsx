import { useState, type ReactNode } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { Check, ChevronDown, CircleHelp, Quote } from "lucide-react"
import type { SetupBookFactId, SetupRecommendation } from "@adt/types"
import { Collapsible } from "@/components/ui/collapsible"
import { cn } from "@/lib/utils"
import type { FactAnswers } from "../../../engine/answers"
import { FACT_QUESTION, FACT_SHORT, RULE_WHY, TEXT_LAYER } from "../../../engine/words"
import { settingsDrivenBy, type Finding } from "../model"
import { useSettingWords } from "../useBookState"
import { FACT_TOPIC, TOPIC_PAGES, TOPIC_TEXT } from "../words"
import { FactOptions } from "./FactOptions"
import { PageChips } from "./PageChips"

export type NoteTone = "plain" | "ask" | "done"

/** The paper a note is written on: yellow for what the AI found, blue for a question, green once answered. */
export const PAPER: Record<NoteTone, string> = {
  plain: "bg-[#fff6c9] text-stone-800 dark:bg-[#2e2a1b] dark:text-amber-50",
  ask: "bg-[#eaf2ff] text-stone-800 ring-1 ring-brand-300 dark:bg-[#1b2540] dark:text-slate-100 dark:ring-brand-400/40",
  done: "bg-[#e6f6ec] text-stone-800 dark:bg-[#17291f] dark:text-emerald-50",
}

export const BADGE: Record<NoteTone, string> = {
  plain: "bg-stone-800 text-amber-50 dark:bg-amber-100 dark:text-stone-900",
  ask: "bg-brand-600 text-white",
  done: "bg-emerald-600 text-white",
}

export function languageName(code: string, locale: string) {
  try {
    return new Intl.DisplayNames([locale], { type: "language" }).of(code) ?? code
  } catch {
    return code
  }
}

type Props = {
  finding: Finding
  number: number
  rec: SetupRecommendation
  answers: FactAnswers
  answered: boolean
  active: boolean
  /** List view: every note open, nothing to activate. */
  flat?: boolean
  onActivate: () => void
  onAnswer: (fact: SetupBookFactId, value: string) => void
  onShowPage: (page: number) => void
}

/**
 * One note in the book's margin. A finding shows its answer in one line and opens to the AI's own
 * words, the pages that show it and the bookmarks it moves; it can be corrected ("Not right?").
 * A question shows its answers until the user picks one, then folds to that answer.
 */
export function Note({ finding, number, rec, answers, answered, active, flat, onActivate, onAnswer, onShowPage }: Props) {
  const { t, i18n } = useLingui()
  const words = useSettingWords()
  const [correcting, setCorrecting] = useState(false)
  const [reopened, setReopened] = useState(false)
  const fact = "fact" in finding ? finding.fact : null
  const asking = finding.asked && (!answered || reopened)
  const tone: NoteTone = finding.asked ? (answered ? "done" : "ask") : "plain"
  const open = flat || active || asking
  const headingId = `note-${finding.key}`

  let topic: string
  let summary: ReactNode
  let detail: ReactNode = null
  if (finding.key === "text") {
    topic = i18n._(TOPIC_TEXT)
    summary = i18n._(TEXT_LAYER[rec.measured.textLayer]!)
    if (rec.measured.language) detail = <p className="text-[12.5px]"><Trans>Written in {languageName(rec.measured.language, i18n.locale)}.</Trans></p>
  } else if (finding.key === "pages") {
    topic = i18n._(TOPIC_PAGES)
    summary = RULE_WHY[finding.rule] ? i18n._(RULE_WHY[finding.rule]!) : finding.rule
  } else {
    topic = i18n._(FACT_TOPIC[finding.key])
    summary = asking ? i18n._(FACT_QUESTION[finding.key]) : i18n._(FACT_SHORT[finding.key][answers[finding.key]]!)
  }
  const drives = fact ? settingsDrivenBy(rec, answers, fact.id) : []
  const disagree = fact && fact.secondOpinion && fact.secondOpinion !== fact.value

  const pick = (value: string) => {
    if (!fact) return
    onAnswer(fact.id, value)
    setReopened(false)
    setCorrecting(false)
  }

  return (
    <article
      aria-labelledby={headingId}
      className={cn(
        "relative rounded-[4px] px-4 pb-3.5 pt-4 shadow-[0_1px_1px_rgba(0,0,0,0.06),0_12px_24px_-16px_rgba(60,45,0,0.6)] transition-[transform,box-shadow] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] dark:shadow-[0_12px_24px_-16px_rgba(0,0,0,0.9)]",
        PAPER[tone],
        !flat && (active ? "z-10 rotate-0 scale-[1.01] shadow-[0_2px_2px_rgba(0,0,0,0.06),0_18px_34px_-18px_rgba(60,45,0,0.7)]" : number % 2 ? "-rotate-[0.6deg]" : "rotate-[0.5deg]"),
      )}
    >
      <span aria-hidden className="absolute -top-2 left-1/2 h-4 w-16 -translate-x-1/2 -rotate-2 rounded-[2px] bg-white/55 shadow-[0_1px_2px_rgba(0,0,0,0.08)] backdrop-blur-[1px] dark:bg-white/15" />
      <div className="relative flex items-start gap-2.5">
        <span aria-hidden className={cn("mt-px grid size-6 shrink-0 place-items-center rounded-full text-[11.5px] font-bold shadow-sm", BADGE[tone])}>
          {tone === "done" ? <Check className="size-3.5 stroke-[3]" /> : number}
        </span>
        <div className="min-w-0 flex-1">
          <h3 id={headingId} className="flex flex-wrap items-center gap-x-2 text-[11px] font-bold uppercase tracking-[0.08em] opacity-70">
            <span className="sr-only">{t`Note ${number}:`} </span>
            {topic}
            {finding.asked && !answered && (
              <span className="inline-flex items-center gap-1 rounded-full bg-brand-600 px-1.5 py-px text-[10px] tracking-[0.04em] text-white normal-case">
                <CircleHelp aria-hidden className="size-3" />
                <Trans>Needs your answer</Trans>
              </span>
            )}
            {answered && (
              <span className="rounded-full bg-emerald-600/15 px-1.5 py-px text-[10px] tracking-[0.04em] text-emerald-800 normal-case dark:text-emerald-200">
                {finding.asked ? <Trans>You answered</Trans> : <Trans>Corrected by you</Trans>}
              </span>
            )}
          </h3>
          {flat || asking ? (
            <p className={cn("mt-0.5 leading-snug", asking ? "text-[15px] font-semibold" : "text-[14px] font-semibold")}>{summary}</p>
          ) : (
            <button type="button" onClick={onActivate} aria-expanded={open} className="group mt-0.5 flex w-full items-start gap-2 rounded-md text-left outline-none after:absolute after:-inset-1.5 after:rounded-lg after:content-[''] focus-visible:after:ring-2 focus-visible:after:ring-brand-400">
              <span className="min-w-0 flex-1 text-[14px] font-semibold leading-snug">{summary}</span>
              <ChevronDown aria-hidden className={cn("mt-0.5 size-4 shrink-0 opacity-50 transition-transform duration-200 group-hover:opacity-90", open && "rotate-180")} />
            </button>
          )}
        </div>
      </div>

      <Collapsible shown={open}>
        <div inert={!open} className="flex flex-col gap-2.5 pl-[34px] pt-2.5">
          {asking && fact && (
            <>
              <p className="text-[12.5px] leading-snug opacity-80">
                {fact.askReason === "few-body-pages" ? <Trans>There were only a few pages to go on, so the AI isn&apos;t sure.</Trans> : <Trans>The two AI readings disagree here. Pick the one that fits your book.</Trans>}
              </p>
              <FactOptions rec={rec} fact={fact} answers={answers} checked={answered ? answers[fact.id] : null} legend={i18n._(FACT_QUESTION[fact.id])} onPick={pick} />
            </>
          )}
          {detail}
          {fact?.reason && (
            <p className="flex gap-1.5 text-[12.5px] italic leading-snug opacity-85">
              <Quote aria-hidden className="mt-0.5 size-3 shrink-0 opacity-60" />
              <span>
                <span className="sr-only">{t`What the AI saw:`} </span>
                {fact.reason}
              </span>
            </p>
          )}
          {!asking && disagree && !finding.asked && (
            <p className="text-[12px] leading-snug opacity-75">
              <Trans>The second reading said &ldquo;{i18n._(FACT_SHORT[fact.id][fact.secondOpinion!]!)}&rdquo;; that doesn&apos;t change any bookmark.</Trans>
            </p>
          )}
          {drives.length > 0 && !asking && (
            <p className="text-[12px] font-medium opacity-75">
              <Trans>Sets: {drives.map((id) => words.name(id)).join(", ")}</Trans>
            </p>
          )}
          <PageChips pages={finding.pages} onShowPage={onShowPage} />
          {fact && !asking && (
            <>
              {finding.asked ? (
                <button type="button" onClick={() => setReopened(true)} className="self-start text-[12.5px] font-semibold text-brand-700 underline decoration-brand-300 underline-offset-4 hover:text-brand-800">
                  <Trans>Change my answer</Trans>
                </button>
              ) : (
                <>
                  <button type="button" aria-expanded={correcting} onClick={() => setCorrecting((c) => !c)} className="self-start text-[12.5px] font-semibold text-brand-700 underline decoration-brand-300 underline-offset-4 hover:text-brand-800">
                    {correcting ? <Trans>Keep it as it is</Trans> : <Trans>Not right? Correct it</Trans>}
                  </button>
                  <Collapsible shown={correcting}>
                    <div inert={!correcting}>
                      <FactOptions rec={rec} fact={fact} answers={answers} checked={answers[fact.id]} legend={i18n._(FACT_QUESTION[fact.id])} onPick={pick} />
                    </div>
                  </Collapsible>
                </>
              )}
            </>
          )}
        </div>
      </Collapsible>
    </article>
  )
}
