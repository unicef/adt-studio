import { useId, type ReactNode } from "react"
import { Trans } from "@lingui/react/macro"
import { Check, ChevronDown, FileText } from "lucide-react"
import { usePageThumb } from "@/components/wizard/core/pdf/usePageThumb"
import { cn } from "@/lib/utils"
import type { CheckLayout } from "../shared/checkLayout"

export type PickOption = { value: string; title: string; hint: string; thumb: ReactNode; extra?: ReactNode }

type Props = {
  layout: Exclude<CheckLayout, "card">
  /** The question, as the user would ask it ("What is this book mostly?"). */
  question: string
  /** The statement for the sentence layout, around the answer: "This book is {answer}." */
  sentence?: { before: string; after: string }
  options: PickOption[]
  chosen: string
  /** The engine's own answer. */
  guess: string
  /** Sure (nothing asked) or asked (the readings disagree). */
  sure: boolean
  /** Why: the assistant's reason, or why it asks. */
  why?: ReactNode
  /** The book's pages behind the answer. */
  pages: number[]
  file: File | null | undefined
  onPick: (value: string, el: HTMLElement) => void
}

/** One page of the user's book, small, with its number. */
function BookPage({ file, page, size = "md" }: { file: File | null | undefined; page: number; size?: "sm" | "md" }) {
  const src = usePageThumb(file ?? null, page, size === "md" ? 260 : 120)
  return (
    <figure className="flex shrink-0 flex-col gap-1.5">
      <span className={cn("grid place-items-center overflow-hidden rounded-[6px] bg-muted shadow-[0_8px_22px_-14px_rgba(15,23,42,0.5)] ring-1 ring-border", size === "md" ? "h-[190px] w-[170px] bg-white lg:h-[clamp(190px,28vh,270px)] lg:w-[clamp(170px,25vh,240px)]" : "h-[64px] w-[56px] bg-white")}>
        {src ? <img src={src} alt="" className="h-full w-full bg-white object-contain" /> : <FileText className="size-5 text-muted-foreground/60" />}
      </span>
      <figcaption className="text-[12.5px] tabular-nums text-muted-foreground">
        <Trans>Page {page}</Trans>
      </figcaption>
    </figure>
  )
}

/** "My pick" / "Your pick" / "My guess": plain words in the accent colour, no pill. */
function Mark({ value, chosen, guess, sure }: { value: string; chosen: string; guess: string; sure: boolean }) {
  if (value === chosen && value !== guess) return <span className="text-[13px] font-medium text-[var(--gd-step-ink)]"><Trans>Your pick</Trans></span>
  if (value === guess) return <span className="text-[13px] font-medium text-[var(--gd-step-ink)]">{sure ? <Trans>My pick</Trans> : <Trans>My guess</Trans>}</span>
  return null
}

/** List: the question, then every answer as a row; the chosen one is checked. Nothing is hidden. */
function ListView({ question, options, chosen, guess, sure, why, onPick }: Props) {
  const label = useId()
  return (
    <div className="flex flex-col gap-3">
      <p id={label} className="text-[17px] font-medium lg:text-[19px]">
        {question}
      </p>
      {why && <p className="max-w-[62ch] text-[14.5px] leading-relaxed text-muted-foreground">{why}</p>}
      <div role="radiogroup" aria-labelledby={label} className="mt-1 flex flex-col">
        {options.map((o) => {
          const on = o.value === chosen
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={(e) => onPick(o.value, e.currentTarget)}
              className={cn("group flex items-center gap-4 border-t border-border py-3.5 text-left transition-colors first:border-t-0 hover:bg-[var(--lc-bubble)] sm:gap-5 sm:px-2", on && "bg-[var(--lc-bubble)]")}
            >
              <span className={cn("grid size-5 shrink-0 place-items-center rounded-full ring-[1.5px] transition-colors", on ? "bg-[var(--gd-step)] ring-[var(--gd-step)] text-white" : "ring-border group-hover:ring-muted-foreground/50")}>{on && <Check className="size-3 stroke-[3]" />}</span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex flex-wrap items-baseline gap-x-3">
                  <span className={cn("text-[16px] lg:text-[17px]", on ? "font-semibold" : "font-medium")}>{o.title}</span>
                  <Mark value={o.value} chosen={chosen} guess={guess} sure={sure} />
                </span>
                <span className="text-[14px] text-muted-foreground">{o.hint}</span>
                {o.extra}
              </span>
              <span className="grid h-[64px] w-[96px] shrink-0 place-items-center overflow-hidden rounded-[8px] lg:h-[84px] lg:w-[126px]">{o.thumb}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** Evidence: the book's own pages on the left; the answer, the reason and a switch for the others on the right. */
function EvidenceView({ question, options, chosen, guess, sure, why, pages, file, onPick }: Props) {
  const label = useId()
  const pick = options.find((o) => o.value === chosen) ?? options[0]!
  const shown = pages.slice(0, 2)
  return (
    <div className="grid gap-8 lg:grid-cols-[auto_minmax(0,1fr)] lg:gap-12">
      <div className="flex flex-col gap-2">
        <span className="text-[13px] text-muted-foreground">
          <Trans>What I looked at</Trans>
        </span>
        <div className="flex gap-3">{shown.length ? shown.map((p) => <BookPage key={p} file={file} page={p} />) : <span className="text-[14px] text-muted-foreground"><Trans>No single page decides this.</Trans></span>}</div>
      </div>
      <div className="flex min-w-0 flex-col gap-4 lg:pt-6">
        <span id={label} className="text-[14px] text-muted-foreground">
          {question}
        </span>
        <span className="text-[28px] font-semibold leading-tight tracking-[-0.02em] lg:text-[34px]">{pick.title}</span>
        <span className="text-[15.5px] text-muted-foreground">{pick.hint}</span>
        {why && <p className="max-w-[56ch] border-l-2 border-[var(--gd-step)] pl-3 text-[15px] leading-relaxed">{why}</p>}
        {pick.extra}
        <div role="radiogroup" aria-labelledby={label} className="mt-2 inline-flex w-fit flex-wrap gap-1 rounded-[12px] bg-muted p-1">
          {options.map((o) => {
            const on = o.value === chosen
            return (
              <button key={o.value} type="button" role="radio" aria-checked={on} onClick={(e) => onPick(o.value, e.currentTarget)} className={cn("rounded-[9px] px-3.5 py-2 text-[14px] transition-colors", on ? "bg-[var(--lc-bubble)] font-semibold shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                {o.title}
                {!sure && o.value === guess && !on && <span className="ml-1.5 text-[12px] text-[var(--gd-step-ink)]"><Trans>my guess</Trans></span>}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/** Sentence: one plain statement with the answer as an inline choice, then the reason and the pages. */
function SentenceView({ question, sentence, options, chosen, why, pages, file, onPick, sure }: Props) {
  const pick = options.find((o) => o.value === chosen) ?? options[0]!
  return (
    <div className="flex flex-col gap-6">
      <p className="text-[26px] font-semibold leading-snug tracking-[-0.02em] lg:text-[34px]">
        {sentence?.before}{" "}
        <label className="relative inline-flex items-baseline">
          <span className="sr-only">{question}</span>
          <select
            value={chosen}
            style={{ fieldSizing: "content" } as React.CSSProperties}
            onChange={(e) => onPick(e.target.value, e.currentTarget)}
            className="cursor-pointer appearance-none rounded-[8px] bg-transparent pr-8 text-[var(--gd-step-ink)] underline decoration-[var(--gd-step)] decoration-2 underline-offset-[6px] outline-none hover:bg-[var(--lc-bubble)] focus-visible:ring-2 focus-visible:ring-[var(--gd-step)]"
          >
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.title}
              </option>
            ))}
          </select>
          <ChevronDown aria-hidden className="pointer-events-none absolute right-1 top-1/2 size-5 -translate-y-1/2 text-[var(--gd-step-ink)]" />
        </label>
        {sentence?.after}
      </p>
      <div className="flex flex-col gap-1.5">
        <span className="text-[15.5px] text-muted-foreground">{pick.hint}</span>
        {why && <p className="max-w-[62ch] text-[15px] leading-relaxed">{why}</p>}
        {!sure && (
          <p className="text-[14px] text-[var(--gd-step-ink)]">
            <Trans>My readings disagree here, so check the answer above.</Trans>
          </p>
        )}
        {pick.extra}
      </div>
      {pages.length > 0 && (
        <div className="flex items-end gap-3">
          {pages.slice(0, 4).map((p) => (
            <BookPage key={p} file={file} page={p} size="sm" />
          ))}
        </div>
      )}
    </div>
  )
}

/** A Check decision in one of the non-card layouts. */
export function PickView(props: Props) {
  if (props.layout === "list") return <ListView {...props} />
  if (props.layout === "evidence") return <EvidenceView {...props} />
  return <SentenceView {...props} />
}
