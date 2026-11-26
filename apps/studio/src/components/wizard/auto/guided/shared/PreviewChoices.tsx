import { useState, type ReactNode } from "react"
import { CircleHelp, Sparkles } from "lucide-react"
import { Trans, useLingui } from "@lingui/react/macro"
import { msg } from "@lingui/core/macro"
import type { SetupDecided, SetupFact, SetupRecommendation, SetupSettingId } from "@adt/types"
import { cn } from "@/lib/utils"
import { OptionsHelp } from "./OptionsHelp"
import { useDetailsLook, usePicked } from "./detailsLook"
import { Screen } from "./Screen"
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
import { WizardSettings } from "./WizardSettings"
import { useWizardNames } from "./wizardNames"
import "./question.css"

export { Screen }

/** Below this width the cards stack as rows (picture beside the words), so the previews stay readable on a phone. */
const NARROW = 520

/**
 * One card: a label and a line, with the book as it would come out (`look`) or a drawing (`art`)
 * when the user's pages wouldn't tell the options apart. With "Wizard names" on, `settings` shows
 * what the option applies, `changed` marking what differs between the options.
 */
export type LookOption = { value: string; label: string; line: string; look: Look; guess: boolean; art?: ReactNode; more?: string; guide?: OptionGuide; why?: ReactNode; settings?: SetupDecided; only?: SetupSettingId[]; changed?: SetupSettingId[] }

function LookCard({ rec, option, page, narrow, chosen, first, onPick, file }: { rec: SetupRecommendation; option: LookOption; page: number; narrow: boolean; chosen: boolean; first: boolean; onPick: (card: HTMLElement) => void; file: File | null | undefined }) {
  const describe = useDescribe()
  const names = useWizardNames()
  const { ref, box } = useBox<HTMLSpanElement>()
  const width = Math.max(80, Math.min(box.w - 28, ((box.h - 24) * SCREEN.desktop.w) / SCREEN.desktop.h))
  const pages = screenPages(rec, option.look.pageGrouping, page)
  const srcs = useScreenImages(file, pages)
  const card = (
    <button
      type="button"
      aria-pressed={chosen}
      data-q-first={first ? "" : undefined}
      onClick={(e) => onPick(e.currentTarget)}
      aria-label={`${option.label}. ${option.line}.${option.art ? "" : ` ${describe(option.look, "desktop", pages)}`}`}
      className={cn("qd18-o group relative flex min-w-0 p-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500", narrow ? "flex-row items-center gap-3" : "flex-col", chosen && "is-sel")}
    >
      <span ref={ref} className={cn("qd18-pv relative grid shrink-0 place-items-center overflow-hidden rounded-[12px]", narrow ? "h-[96px] w-[132px]" : "h-[150px] lg:h-[170px]")}>
        {option.art ? (
          <span className="qd18-dev block h-full w-full p-2">{option.art}</span>
        ) : (
          box.w > 0 && (
            <span className="qd18-dev">
              <Screen shown={option.look} srcs={srcs} width={width} />
            </span>
          )
        )}
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
        {names && option.settings && <WizardSettings settings={option.settings} only={option.only} changed={option.changed} className="mt-2" />}
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
  const cols = options.length
  const narrow = box.w > 0 && box.w < NARROW
  const [help, setHelp] = useState(false)
  const explains = options.some((o) => o.more)
  const look = useDetailsLook()
  const picked = usePicked()
  // In a sheet, picking closes it so the pick shows on the page.
  const pick = (value: string, card: HTMLElement | null) => {
    onPick(value, card)
    picked?.()
  }
  return (
    <div className="flex flex-col gap-2 pt-1">
      {look === "switch" && !picked ? (
        <OptionSwitch options={options} chosen={chosen} labelId={labelId} onPick={(v) => pick(v, null)} />
      ) : look === "strip" && !picked ? (
        <OptionStrip rec={rec} options={options} page={page} chosen={chosen} labelId={labelId} file={file} onPick={(v) => pick(v, null)} />
      ) : (
        <div ref={ref} role="group" aria-labelledby={labelId} className="grid gap-3" style={{ gridTemplateColumns: narrow ? "minmax(0, 1fr)" : `repeat(${cols}, minmax(0, 1fr))` }}>
          {box.w > 0 && options.map((o, i) => <LookCard key={o.value} rec={rec} option={o} page={page} narrow={narrow} chosen={chosen === o.value} first={i === 0} onPick={(card) => pick(o.value, card)} file={file} />)}
        </div>
      )}
      {explains && (
        <>
          <button type="button" onClick={() => setHelp(true)} className="lc-link -ml-1.5 inline-flex min-h-9 w-fit items-center gap-1.5 px-1.5 text-[13.5px] font-medium">
            <CircleHelp className="size-4" />
            <Trans>What do these options mean?</Trans>
          </button>
          <OptionsHelp open={help} onOpenChange={setHelp} rec={rec} options={options} page={page} chosen={chosen} file={file} onPick={(v) => { setHelp(false); pick(v, null) }} />
        </>
      )}
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
  // The settings that differ between the answers, for "Wizard names".
  const changed = touched.filter((id) => new Set(decided.map((d) => String(d[id]?.value))).size > 1)
  const options = order.map((value, i): LookOption => ({
    value,
    label: i18n._(FACT_SHORT[fact.id][value]!),
    line: i18n._(distinct && !factArt(fact.id, value) ? plain[i]! : FACT_HINT[fact.id]![value]!),
    look: lookOf(decided[i]!),
    guess: value === fact.value,
    art: factArt(fact.id, value) ?? undefined,
    more: FACT_LONG[fact.id][value] ? i18n._(FACT_LONG[fact.id][value]!) : undefined,
    guide: FACT_GUIDE[fact.id]?.[value],
    why: value === fact.value ? <FactWhy fact={fact} file={file} /> : undefined,
    settings: decided[i],
    only: touched.length ? touched : undefined,
    changed,
  }))
  return <LookChoices rec={rec} options={options} page={fact.evidencePages[0] ?? rec.previewPage} chosen={chosen} onPick={onAnswer} file={file} labelId={labelId} />
}

/** Why the engine guessed this answer: the reading's own words and the pages it looked at. */
function FactWhy({ fact, file }: { fact: SetupFact; file: File | null | undefined }) {
  const { i18n } = useLingui()
  const other = fact.secondOpinion && fact.secondOpinion !== fact.value ? FACT_SHORT[fact.id][fact.secondOpinion] : undefined
  return (
    <>
      {fact.reason && <span className="block">“{fact.reason}”</span>}
      {fact.evidencePages.length > 0 && (
        <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <Trans>Pages I looked at:</Trans> <Citation file={file} pages={fact.evidencePages} />
        </span>
      )}
      {other && <span className="mt-1.5 block">{i18n._(msg`A second look thought it could be “${i18n._(other)}”, so check this one.`)}</span>}
    </>
  )
}

/** The options as a segmented switch: one tap picks, and the big picture above changes at once. */
function OptionSwitch({ options, chosen, labelId, onPick }: { options: LookOption[]; chosen?: string; labelId: string; onPick: (value: string) => void }) {
  return (
    <div role="radiogroup" aria-labelledby={labelId} className="inline-flex w-fit max-w-full flex-wrap gap-1 rounded-full bg-black/[0.05] p-1 dark:bg-white/[0.06]">
      {options.map((o) => {
        const on = chosen === o.value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onPick(o.value)}
            className={cn("inline-flex min-h-10 items-center gap-1.5 rounded-full px-4 text-[14px] font-medium transition-[background-color,color,box-shadow] duration-200", on ? "bg-[var(--lc-bubble)] text-brand-700 shadow-[0_1px_2px_rgb(0_0_0/0.08),0_2px_8px_-2px_rgb(0_0_0/0.12)] dark:text-brand-300" : "text-muted-foreground hover:text-foreground")}
          >
            {o.label}
            {o.guess && <Sparkles className="size-3.5 text-brand-500" />}
          </button>
        )
      })}
    </div>
  )
}

/** The options as small pictures in a row, always in view: one tap picks. */
function OptionStrip({ rec, options, page, chosen, labelId, file, onPick }: { rec: SetupRecommendation; options: LookOption[]; page: number; chosen?: string; labelId: string; file: File | null | undefined; onPick: (value: string) => void }) {
  return (
    <div role="radiogroup" aria-labelledby={labelId} className="flex flex-wrap gap-2.5">
      {options.map((o) => (
        <StripItem key={o.value} rec={rec} option={o} page={page} on={chosen === o.value} file={file} onPick={() => onPick(o.value)} />
      ))}
    </div>
  )
}

function StripItem({ rec, option, page, on, file, onPick }: { rec: SetupRecommendation; option: LookOption; page: number; on: boolean; file: File | null | undefined; onPick: () => void }) {
  const pages = screenPages(rec, option.look.pageGrouping, page)
  const srcs = useScreenImages(file, pages)
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      onClick={onPick}
      className={cn("group flex w-[180px] flex-col gap-1.5 rounded-[14px] p-1.5 text-left ring-1 transition-[box-shadow,background-color] duration-200", on ? "bg-[var(--lc-bubble)] ring-2 ring-brand-500" : "ring-border hover:bg-[var(--lc-bubble)] hover:ring-brand-300")}
    >
      <span aria-hidden className="qd18-pv grid h-[96px] w-full place-items-center overflow-hidden rounded-[10px]">
        {option.art ? <span className="block h-full w-full p-1.5">{option.art}</span> : <Screen shown={option.look} srcs={srcs} width={150} />}
      </span>
      <span className="flex items-center gap-1.5 px-1 pb-0.5 text-[13.5px] font-medium leading-tight">
        {option.label}
        {option.guess && <Sparkles className="size-3.5 shrink-0 text-brand-500" />}
      </span>
    </button>
  )
}
