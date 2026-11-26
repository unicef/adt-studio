import { Trans, useLingui } from "@lingui/react/macro"
import type { SetupFact, SetupRecommendation, SetupSettingId } from "@adt/types"
import { cn } from "@/lib/utils"
import { settingsFor, settingsTouchedBy, type FactAnswers } from "../../engine/answers"
import { FACT_SHORT } from "../../engine/words"
import { FACT_HINT, plainTitle } from "./words"
import { SCREEN, ScreenContent, type Shown } from "./screens/layouts"
import { screenPages, useDescribe, useScreenImages } from "./screens/pages"
import { useBox } from "./screens/useBox"
import { lookOf, type Look } from "./screens/look"
import "./question.css"

/** One screen of the book as it would come out, drawn like a page on the board: no device frame. */
export function Screen({ shown, srcs, width }: { shown: Shown; srcs: (string | undefined)[]; width: number }) {
  const s = SCREEN.desktop
  const scale = width / s.w
  return (
    <span className="qd18-pg relative block overflow-hidden rounded-[5px] bg-white" style={{ width, height: s.h * scale }}>
      <span className="absolute left-0 top-0 block origin-top-left" style={{ transform: `scale(${scale})` }}>
        <ScreenContent shown={shown} device="desktop" srcs={srcs} />
      </span>
    </span>
  )
}

/** Below this width the cards stack as rows (picture beside the words), so the previews stay readable on a phone. */
const NARROW = 520

export type LookOption = { value: string; label: string; line: string; look: Look; guess: boolean }

function LookCard({ rec, option, page, width, narrow, chosen, first, onPick, file }: { rec: SetupRecommendation; option: LookOption; page: number; width: number; narrow: boolean; chosen: boolean; first: boolean; onPick: () => void; file: File | null | undefined }) {
  const describe = useDescribe()
  const pages = screenPages(rec, option.look.pageGrouping, page)
  const srcs = useScreenImages(file, pages)
  return (
    <button
      type="button"
      aria-pressed={chosen}
      data-q-first={first ? "" : undefined}
      onClick={onPick}
      aria-label={`${option.label}. ${option.line}. ${describe(option.look, "desktop", pages)}`}
      className={cn("qd18-o group relative flex min-w-0 p-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500", narrow ? "flex-row items-center gap-3" : "flex-col", chosen && "is-sel")}
    >
      <span className={cn("qd18-pv relative grid shrink-0 place-items-center overflow-hidden rounded-[12px]", narrow ? "h-[96px] w-[132px]" : "h-[150px] lg:h-[200px]")}>
        <span className="qd18-dev">
          <Screen shown={option.look} srcs={srcs} width={width} />
        </span>
        {option.guess && !narrow && (
          <span className="absolute left-2 top-2 whitespace-nowrap rounded-full bg-[var(--lc-bubble)] px-2 py-0.5 text-[11px] font-medium text-brand-700 shadow-sm">
            <Trans>My guess</Trans>
          </span>
        )}
      </span>
      <span className={cn("flex min-w-0 flex-col", narrow ? "py-1 pr-1" : "px-1.5 pb-1 pt-2.5")}>
        {option.guess && narrow && (
          <span className="mb-1 w-fit whitespace-nowrap rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
            <Trans>My guess</Trans>
          </span>
        )}
        <span className="text-[15px] font-medium leading-tight lg:text-[17px]">{option.label}</span>
        <span className="mt-0.5 text-[13px] leading-snug text-muted-foreground lg:text-[14.5px]">{option.line}</span>
      </span>
    </button>
  )
}

/**
 * Picture cards side by side (stacked as rows on narrow screens): each a screen of the book as it
 * would come out, drawn on one of the user's own pages, a plain label and one short line. The
 * picked card lifts with an accent edge; the others' pictures sit back a little.
 */
export function LookChoices({ rec, options, page, chosen, onPick, file, labelId }: { rec: SetupRecommendation; options: LookOption[]; page: number; chosen?: string; onPick: (value: string) => void; file: File | null | undefined; labelId: string }) {
  const { ref, box } = useBox()
  const cols = options.length
  const narrow = box.w > 0 && box.w < NARROW
  const card = (box.w - 12 * (cols - 1)) / cols
  // The screen fits the picture area (150px tall, 16:10; 96px in a row) with room around it.
  const width = narrow ? 116 : Math.max(110, Math.min(card - 30, (134 * SCREEN.desktop.w) / SCREEN.desktop.h))
  return (
    <div ref={ref} role="group" aria-labelledby={labelId} className="grid gap-3 pt-1" style={{ gridTemplateColumns: narrow ? "minmax(0, 1fr)" : `repeat(${cols}, minmax(0, 1fr))` }}>
      {box.w > 0 && options.map((o, i) => <LookCard key={o.value} rec={rec} option={o} page={page} width={width} narrow={narrow} chosen={chosen === o.value} first={i === 0} onPick={() => onPick(o.value)} file={file} />)}
    </div>
  )
}

/**
 * The answers to one fact as picture cards (d18): each shows the book as that answer would set it
 * up, on the page that shows the fact, with what you'd get in plain words ("Picture beside the
 * words"), or the answer's own hint when that wouldn't tell the answers apart.
 */
export function PreviewChoices({ rec, fact, order, answers, chosen, onAnswer, file, labelId }: { rec: SetupRecommendation; fact: SetupFact; order: string[]; answers: FactAnswers; chosen?: string; onAnswer: (value: string) => void; file: File | null | undefined; labelId: string }) {
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
    line: i18n._(distinct ? plain[i]! : FACT_HINT[fact.id]![value]!),
    look: lookOf(decided[i]!),
    guess: value === fact.value,
  }))
  return <LookChoices rec={rec} options={options} page={fact.evidencePages[0] ?? rec.previewPage} chosen={chosen} onPick={onAnswer} file={file} labelId={labelId} />
}
