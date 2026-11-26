import { useState, type ReactNode } from "react"
import { ArrowLeft, ArrowRight, Check, CircleHelp } from "lucide-react"
import { PrimaryButton } from "../../../core/ui"
import { Trans, useLingui } from "@lingui/react/macro"
import type { SetupDecided, SetupFact, SetupRecommendation, SetupSettingId } from "@adt/types"
import { cn } from "@/lib/utils"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { Assistant } from "./Assistant"
import { useIsWizard, WizardPose } from "./WizardPose"
import { settingsFor, settingsTouchedBy, type FactAnswers } from "../../engine/answers"
import { FACT_LONG, FACT_SHORT } from "../../engine/words"
import { FACT_HINT, plainTitle } from "./words"
import { SCREEN, ScreenContent, type Shown } from "./screens/layouts"
import { screenPages, useDescribe, useScreenImages } from "./screens/pages"
import { useBox } from "./screens/useBox"
import { lookOf, type Look } from "./screens/look"
import { factArt } from "./art/ConceptArt"
import { WizardSettings } from "./WizardSettings"
import { useWizardNames } from "./wizardNames"
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

/**
 * One card: a label and a line, with the book as it would come out (`look`) or a drawing (`art`)
 * when the user's pages wouldn't tell the options apart. With "Wizard names" on, `settings` shows
 * what the option applies, `changed` marking what differs between the options.
 */
export type LookOption = { value: string; label: string; line: string; look: Look; guess: boolean; art?: ReactNode; more?: string; settings?: SetupDecided; only?: SetupSettingId[]; changed?: SetupSettingId[] }

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
  return (
    <div className="flex flex-col gap-2 pt-1">
      <div ref={ref} role="group" aria-labelledby={labelId} className="grid gap-3" style={{ gridTemplateColumns: narrow ? "minmax(0, 1fr)" : `repeat(${cols}, minmax(0, 1fr))` }}>
        {box.w > 0 && options.map((o, i) => <LookCard key={o.value} rec={rec} option={o} page={page} narrow={narrow} chosen={chosen === o.value} first={i === 0} onPick={(card) => onPick(o.value, card)} file={file} />)}
      </div>
      {explains && (
        <>
          <button type="button" onClick={() => setHelp(true)} className="lc-link -ml-1.5 inline-flex min-h-9 w-fit items-center gap-1.5 px-1.5 text-[13.5px] font-medium">
            <CircleHelp className="size-4" />
            <Trans>What do these options mean?</Trans>
          </button>
          <OptionsHelp open={help} onOpenChange={setHelp} rec={rec} options={options} page={page} chosen={chosen} file={file} onPick={(v) => { setHelp(false); onPick(v, null) }} />
        </>
      )}
    </div>
  )
}

/**
 * One option at a time, at more length than the cards can say: its picture large, and the
 * assistant explaining it in a speech bubble. Arrows (or the arrow keys) move between the
 * options, and the one shown can be picked from here.
 */
function OptionsHelp({ open, onOpenChange, rec, options, page, chosen, file, onPick }: { open: boolean; onOpenChange: (open: boolean) => void; rec: SetupRecommendation; options: LookOption[]; page: number; chosen?: string; file: File | null | undefined; onPick: (value: string) => void }) {
  const wizard = useIsWizard()
  const [at, setAt] = useState(0)
  const [was, setWas] = useState(false)
  // Each time it opens, it starts on the picked option.
  if (open !== was) {
    setWas(open)
    if (open) setAt(Math.max(0, options.findIndex((o) => o.value === chosen)))
  }
  const o = options[at]!
  const go = (d: number) => setAt((i) => (i + d + options.length) % options.length)
  const picked = chosen === o.value
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-[620px] gap-0 p-0"
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") go(1)
          else if (e.key === "ArrowLeft") go(-1)
        }}
      >
        <DialogTitle className="sr-only">
          <Trans>The options, one at a time</Trans>
        </DialogTitle>
        <div role="tablist" className="flex flex-wrap gap-1.5 px-6 pb-1 pr-14 pt-5">
          {options.map((x, i) => (
            <button
              key={x.value}
              type="button"
              role="tab"
              aria-selected={i === at}
              onClick={() => setAt(i)}
              className={cn("inline-flex min-h-9 items-center gap-1 rounded-full border px-3 text-[13.5px] font-medium transition-colors", i === at ? "border-transparent bg-foreground text-background" : "border-border text-muted-foreground hover:text-foreground")}
            >
              {chosen === x.value && <Check className="size-3.5 stroke-[3]" />}
              {x.label}
            </button>
          ))}
        </div>
        <div key={o.value} className="gd-help-in flex flex-col gap-4 px-6 pb-2 pt-4">
          <HelpPicture rec={rec} option={o} page={page} file={file} />
          <div className="flex items-start gap-3">
            {wizard ? <WizardPose pose="hello" size={76} className="-mt-1 shrink-0" /> : <Assistant mood="talking" size={48} />}
            <div className="relative min-h-[104px] min-w-0 flex-1 rounded-[18px] bg-muted/60 px-4 py-3">
              <DialogDescription asChild>
                <div>
                  <p className="text-[17px] font-semibold text-foreground">{o.label}</p>
                  <p className="mt-1 text-[14.5px] leading-relaxed text-muted-foreground">{o.more ?? o.line}</p>
                </div>
              </DialogDescription>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 px-6 pb-5 pt-3">
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => go(-1)} className="inline-grid size-10 place-items-center rounded-full border border-border hover:bg-muted">
              <ArrowLeft className="size-4" />
              <span className="sr-only">
                <Trans>Previous option</Trans>
              </span>
            </button>
            <button type="button" onClick={() => go(1)} className="inline-grid size-10 place-items-center rounded-full border border-border hover:bg-muted">
              <ArrowRight className="size-4" />
              <span className="sr-only">
                <Trans>Next option</Trans>
              </span>
            </button>
            <span className="ml-2 text-[13px] tabular-nums text-muted-foreground">
              <Trans>
                {at + 1} of {options.length}
              </Trans>
            </span>
          </div>
          {picked ? (
            <span className="inline-flex min-h-11 items-center gap-1.5 px-2 text-[14px] font-medium text-brand-700 dark:text-brand-300">
              <Check className="size-4 stroke-[3]" />
              <Trans>This is your pick</Trans>
            </span>
          ) : (
            <PrimaryButton onClick={() => onPick(o.value)}>
              <Trans>Pick this one</Trans>
            </PrimaryButton>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function HelpPicture({ rec, option, page, file }: { rec: SetupRecommendation; option: LookOption; page: number; file: File | null | undefined }) {
  const pages = screenPages(rec, option.look.pageGrouping, page)
  const srcs = useScreenImages(file, pages)
  return (
    <span aria-hidden className="qd18-pv grid h-[260px] w-full place-items-center overflow-hidden rounded-[14px] bg-muted">
      {option.art ? <span className="block h-full w-full p-4">{option.art}</span> : <Screen shown={option.look} srcs={srcs} width={380} />}
    </span>
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
    settings: decided[i],
    only: touched.length ? touched : undefined,
    changed,
  }))
  return <LookChoices rec={rec} options={options} page={fact.evidencePages[0] ?? rec.previewPage} chosen={chosen} onPick={onAnswer} file={file} labelId={labelId} />
}
