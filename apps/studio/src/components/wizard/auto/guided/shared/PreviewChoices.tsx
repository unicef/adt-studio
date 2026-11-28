import { useContext, useState, type ReactNode } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { msg } from "@lingui/core/macro"
import type { SetupFact, SetupRecommendation, SetupSettingId } from "@adt/types"
import { cn } from "@/lib/utils"
import { OptionsHelp } from "./OptionsHelp"
import { useExplain } from "./explain"
import { Screen } from "./Screen"
import { CompactOptionsContext } from "./optionsLayout"
import { Citation } from "./Citation"
import { FACT_GUIDE, type OptionGuide } from "./optionGuide"
import { settingsFor, settingsTouchedBy, type FactAnswers } from "../../engine/answers"
import { FACT_LONG, FACT_SHORT } from "../../engine/words"
import { FACT_HINT, plainTitle } from "./words"
import { SCREEN } from "./screens/layouts"
import { screenPages, useDescribe, useScreenImages } from "./screens/pages"
import { useBox } from "./screens/useBox"
import { lookOf, type Look } from "./screens/look"
import { factArt } from "./art/ConceptArt"
import "./question.css"

export { Screen }

/** Below this width the cards stack as rows (picture beside the words), so the previews stay readable on a phone. */
const NARROW = 520

/**
 * One card: a label and a line, with the book as it would come out (`look`) or a drawing (`art`)
 * when the user's pages wouldn't tell the options apart.
 */
export type LookOption = { value: string; label: string; line: string; look: Look; guess: boolean; art?: ReactNode; more?: string; phone?: string; tag?: ReactNode; guide?: OptionGuide; why?: ReactNode }

function LookCard({ rec, option, page, narrow, compact = false, chosen, first, onPick, file }: { rec: SetupRecommendation; option: LookOption; page: number; narrow: boolean; compact?: boolean; chosen: boolean; first: boolean; onPick: (card: HTMLElement) => void; file: File | null | undefined }) {
  const describe = useDescribe()
  const { ref, box } = useBox<HTMLSpanElement>()
  const width = Math.max(80, Math.min(box.w - 28, ((box.h - 24) * SCREEN.desktop.w) / SCREEN.desktop.h))
  const pages = screenPages(rec, option.look.pageGrouping, page)
  const srcs = useScreenImages(file, pages)
  // Compact (the inline lab variant) draws like the narrow row: a small picture beside the words.
  const row = narrow || compact
  const card = (
    <button
      type="button"
      aria-pressed={chosen}
      data-q-first={first ? "" : undefined}
      onClick={(e) => onPick(e.currentTarget)}
      aria-label={`${option.label}. ${option.line}.${option.art ? "" : ` ${describe(option.look, "desktop", pages)}`}`}
      className={cn("qd18-o group relative flex min-w-0 p-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500", row ? "flex-row items-center gap-3" : "flex-col", chosen && "is-sel")}
    >
      <span ref={ref} className={cn("relative grid shrink-0 place-items-center overflow-hidden rounded-[12px]", !option.art && "qd18-pv", compact ? "h-[68px] w-[96px]" : narrow ? "h-[96px] w-[132px]" : "h-[max(100px,calc(150px-var(--gd-squeeze,0px)))] lg:h-[max(84px,calc(170px-var(--gd-squeeze,0px)))]")}>
        {option.art ? (
          <span className="qd18-dev block h-full w-full p-2">{option.art}</span>
        ) : (
          box.w > 0 && (
            <span className="qd18-dev">
              <Screen shown={option.look} srcs={srcs} width={width} />
            </span>
          )
        )}
        {option.guess && !row && (
          <span className="absolute left-2 top-2 whitespace-nowrap rounded-full bg-[var(--lc-bubble)] px-2 py-0.5 text-[11px] font-medium text-brand-700 shadow-sm">
            <Trans>My guess</Trans>
          </span>
        )}
      </span>
      <span className={cn("flex min-w-0 flex-col", row ? "py-1 pr-1" : "px-1.5 pb-1 pt-2.5")}>
        {option.guess && row && (
          <span className="mb-1 w-fit whitespace-nowrap rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
            <Trans>My guess</Trans>
          </span>
        )}
        <span className={cn("font-medium leading-tight", compact ? "text-[14.5px]" : "text-[15px] lg:text-[17px]")}>{option.label}</span>
        {option.line && <span className={cn("mt-0.5 leading-snug text-muted-foreground", compact ? "line-clamp-2 text-[12.5px]" : "text-[13px] lg:text-[14.5px]")}>{option.line}</span>}
        {option.tag && !compact && <span className="mt-2">{option.tag}</span>}
      </span>
    </button>
  )
  return card
}

/**
 * Picture cards side by side (stacked as rows on narrow screens): each a screen of the book as it
 * would come out, drawn on one of the user's own pages, a plain label and one short line. The
 * picked card lifts with an accent edge; the others' pictures sit back a little.
 */
export function LookChoices({ rec, options, page, chosen, onPick, file, labelId }: { rec: SetupRecommendation; options: LookOption[]; page: number; chosen?: string; onPick: (value: string, card: HTMLElement | null) => void; file: File | null | undefined; labelId: string }) {
  const { ref, box } = useBox()
  const compact = useContext(CompactOptionsContext)
  // Compact cards need room for a picture beside the words: at most three across.
  const cols = compact ? Math.min(options.length, box.w > 0 && box.w < 760 ? 2 : 3) : options.length
  const narrow = box.w > 0 && box.w < NARROW
  const [help, setHelp] = useState(false)
  const explains = options.some((o) => o.more)
  // The assistant's bubble offers this explanation ("Not sure? I can explain ...").
  useExplain("options", () => setHelp(true), explains)
  return (
    <div className="flex flex-col gap-2 pt-1">
      <div ref={ref} role="group" aria-labelledby={labelId} className="grid gap-3" style={{ gridTemplateColumns: narrow ? "minmax(0, 1fr)" : `repeat(${cols}, minmax(0, 1fr))` }}>
        {box.w > 0 && options.map((o, i) => <LookCard key={o.value} rec={rec} option={o} page={page} narrow={narrow} compact={compact} chosen={chosen === o.value} first={i === 0} onPick={(card) => onPick(o.value, card)} file={file} />)}
      </div>
      {explains && <OptionsHelp open={help} onOpenChange={setHelp} rec={rec} options={options} page={page} chosen={chosen} file={file} onPick={(v) => { setHelp(false); onPick(v, null) }} />}
    </div>
  )
}

/**
 * The answers to one fact as picture cards (d18): each shows the book as that answer would set it
 * up, on the page that shows the fact, with what you'd get in plain words ("Picture beside the
 * words"), or the answer's own hint when that wouldn't tell the answers apart.
 */
export function PreviewChoices({ rec, fact, order, answers, chosen, onAnswer, file, labelId }: { rec: SetupRecommendation; fact: SetupFact; order: string[]; answers: FactAnswers; chosen?: string; onAnswer: (value: string, card: HTMLElement | null) => void; file: File | null | undefined; labelId: string }) {
  const { i18n } = useLingui()
  const touched = settingsTouchedBy(rec, answers, fact.id)
  // The setting the answers differ on most visibly comes first.
  const moved: SetupSettingId[] = [...touched].sort((a, b) => Number(b === "renderStrategy" || b === "pageGrouping") - Number(a === "renderStrategy" || a === "pageGrouping"))
  const decided = order.map((value) => settingsFor(rec, { ...answers, [fact.id]: value }))
  const brings = moved[0]
  const plain = decided.map((d) => (brings ? plainTitle(brings, d[brings]?.value) : undefined))
  // When the answers share that line ("Rebuilt to fit the screen" twice), each says its own hint instead.
  const distinct = plain.every((p) => p) && new Set(plain.map((p) => p!.id)).size === plain.length
  const options = order.map((value, i): LookOption => ({
    value,
    label: i18n._(FACT_SHORT[fact.id][value]!),
    line: i18n._(distinct && !factArt(fact.id, value) ? plain[i]! : FACT_HINT[fact.id]![value]!),
    look: lookOf(decided[i]!),
    guess: value === fact.value,
    art: factArt(fact.id, value) ?? undefined,
    more: FACT_LONG[fact.id][value] ? i18n._(FACT_LONG[fact.id][value]!) : undefined,
    guide: FACT_GUIDE[fact.id]?.[value],
    why: value === fact.value ? <FactWhy fact={fact} file={file} /> : fact.secondOpinion === value && fact.secondOpinion !== fact.value ? <SecondWhy fact={fact} /> : undefined,
  }))
  return <LookChoices rec={rec} options={options} page={fact.evidencePages[0] ?? rec.previewPage} chosen={chosen} onPick={onAnswer} file={file} labelId={labelId} />
}

/**
 * Why the engine guessed this answer. The engine reads the book twice: its guess comes from the
 * first reading (the pages), and `reason` is the second reading's own words, so the reason is
 * shown here only when both readings agree; when they don't, it goes with the second reading's
 * answer (SecondWhy) and this one says so.
 */
function FactWhy({ fact, file }: { fact: SetupFact; file: File | null | undefined }) {
  const { i18n } = useLingui()
  const other = fact.secondOpinion && fact.secondOpinion !== fact.value ? FACT_SHORT[fact.id][fact.secondOpinion] : undefined
  return (
    <>
      {other ? (
        <span className="block">{i18n._(msg`My first reading of the pages picked this. When I read the book a second time, I thought it could be “${i18n._(other)}”, so please check.`)}</span>
      ) : (
        <span className="block">{fact.secondOpinion ? <Trans>Both times I read the book, I came to this answer.</Trans> : <Trans>This is what I found when I read the book.</Trans>}</span>
      )}
      {!other && <AiWords reason={fact.reason} />}
      {fact.evidencePages.length > 0 && (
        <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <Trans>Where I read it:</Trans> <Citation file={file} pages={fact.evidencePages} />
        </span>
      )}
    </>
  )
}

/** On the second reading's answer, when the two readings disagree: its own words. */
function SecondWhy({ fact }: { fact: SetupFact }) {
  return (
    <>
      <span className="block">
        <Trans>My second reading picked this one.</Trans>
      </span>
      <AiWords reason={fact.reason} />
    </>
  )
}

/**
 * The AI's own note, on request: it is written in English and in the AI's terms, so the
 * explanation above says it in plain words, and this keeps the AI's reasoning one click away.
 */
function AiWords({ reason }: { reason: string | null | undefined }) {
  const [open, setOpen] = useState(false)
  if (!reason) return null
  return (
    <span className="mt-1 block">
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="lc-link text-[12.5px] font-medium">
        {open ? <Trans>Hide what the AI wrote</Trans> : <Trans>What the AI wrote</Trans>}
      </button>
      {open && (
        <span lang="en" className="mt-1 block text-[12.5px] text-muted-foreground">
          “{reason}”
        </span>
      )}
    </span>
  )
}
