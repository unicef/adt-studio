import { useEffect, useMemo, useState, type ReactNode } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { BookOpen, Check, Columns2, LayoutTemplate, Loader2, type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { PRESETS, RENDER_STRATEGIES } from "@/components/wizard/constants"
import type { AiPicks } from "../review/setup"
import { ENTER } from "../ui"


const REVEAL_MS = 240

/**
 * The recommender answers every decision in one call, so the chips wait together and fill in one
 * after another only once the answer is in. Restarts with `key`.
 */
export function useReveal(answered: boolean, count: number, key: number): { resolved: number; finished: boolean } {
  const [resolved, setResolved] = useState(0)
  useEffect(() => {
    setResolved(0)
  }, [key])
  useEffect(() => {
    if (!answered) return
    const ids = Array.from({ length: count }, (_, i) => window.setTimeout(() => setResolved(i + 1), 120 + i * REVEAL_MS))
    return () => ids.forEach((id) => window.clearTimeout(id))
  }, [answered, count, key])
  return { resolved, finished: answered && resolved >= count }
}

export type Pick = { key: string; icon: LucideIcon; label: ReactNode; answer: ReactNode }

/** The loader's three answer chips, from the recommendation, with the wizard's own names. */
export function usePicks(picks: AiPicks): Pick[] {
  const { i18n } = useLingui()
  return useMemo(() => {
    const preset = PRESETS.find((p) => p.id === picks.preset)
    const strategy = RENDER_STRATEGIES.find((r) => r.id === picks.renderStrategy)
    return [
      { key: "type", icon: BookOpen, label: <Trans>Preset</Trans>, answer: preset ? i18n._(preset.title) : "" },
      { key: "look", icon: LayoutTemplate, label: <Trans>Render Strategy</Trans>, answer: strategy ? i18n._(strategy.title) : "" },
      { key: "pages", icon: Columns2, label: <Trans>Page Grouping Mode</Trans>, answer: picks.pageGrouping === "spread" ? <Trans>Spread</Trans> : <Trans>Single</Trans> },
    ]
  }, [picks.preset, picks.renderStrategy, picks.pageGrouping, i18n])
}

const BOOK_PHRASES = [
  { key: "reading", text: <Trans>Reading through your book…</Trans> },
  { key: "notes", text: <Trans>Taking a few notes…</Trans> },
  { key: "presets", text: <Trans>Comparing it with our presets…</Trans> },
]

/** One line at a time, ~2.6 s each (readable), and it stops once the picks are in. */
export function Phrase({ finished, className }: { finished: boolean; className?: string }) {
  const [index, setIndex] = useState(0)
  useEffect(() => {
    if (finished) return
    const id = window.setInterval(() => setIndex((i) => Math.min(i + 1, BOOK_PHRASES.length - 1)), 2600)
    return () => window.clearInterval(id)
  }, [finished])
  const phrase = finished ? { key: "done", text: <Trans>All set — here&apos;s what we picked</Trans> } : BOOK_PHRASES[index]
  return (
    <div className={cn("grid h-7 place-items-center overflow-hidden text-[16px] font-medium leading-7", className)}>
      <span key={phrase.key} className="animate-in fade-in blur-in slide-in-from-bottom-2 duration-300 ease-out motion-reduce:animate-none">
        {finished ? (
          <span className="inline-flex items-center gap-1.5 text-brand-700">
            <Check className="size-4 stroke-[3]" />
            {phrase.text}
          </span>
        ) : (
          <span className="bg-[linear-gradient(90deg,var(--muted-foreground)_0%,var(--muted-foreground)_40%,var(--brand-500)_50%,var(--muted-foreground)_60%,var(--muted-foreground)_100%)] bg-[length:200%_100%] bg-clip-text text-transparent motion-safe:animate-[am-text-shimmer_2.2s_linear_infinite]">{phrase.text}</span>
        )}
      </span>
    </div>
  )
}

/** Screen-reader updates: only when a pick resolves and when setup is done, never the phrases. */
export function LiveStatus({ picks, resolved }: { picks: Pick[]; resolved: number }) {
  const latest = resolved > 0 ? picks[resolved - 1] : null
  return (
    <span role="status" className="sr-only">
      {latest && (
        <>
          {latest.label}: {latest.answer}.{" "}
        </>
      )}
      {resolved >= picks.length && <Trans>Setup is ready.</Trans>}
    </span>
  )
}

function PickIcon({ done }: { done: boolean }) {
  return (
    <span className="relative grid size-6 shrink-0 place-items-center">
      <span className={cn("absolute inset-0 grid place-items-center rounded-full bg-muted transition-[opacity,transform] duration-300", done ? "scale-50 opacity-0" : "scale-100 opacity-100")}>
        <Loader2 className="size-3.5 animate-spin text-brand-600 motion-reduce:animate-none" />
      </span>
      <span className={cn("absolute inset-0 grid place-items-center rounded-full bg-brand-600 text-primary-foreground transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]", done ? "scale-100 opacity-100" : "scale-50 opacity-0")}>
        <Check className="size-3.5 stroke-[3]" />
      </span>
    </span>
  )
}

/** A pick as a chip: "Book type" while working, then "Book type · Picture book" once resolved. */
export function AnswerChip({ pick, done, index }: { pick: Pick; done: boolean; index: number }) {
  const Icon = pick.icon
  return (
    <span className={cn("inline-flex items-center gap-2 rounded-full py-1.5 pl-1.5 pr-3.5 text-[13.5px] font-semibold ring-1 transition-[background-color,box-shadow,color] duration-300", ENTER, done ? "bg-card text-foreground shadow-[0_6px_18px_-6px_rgba(43,127,255,0.45)] ring-brand-200" : "bg-card/70 text-muted-foreground ring-border")} style={{ animationDelay: `${160 + index * 70}ms` }}>
      <PickIcon done={done} />
      <Icon className={cn("size-4 transition-colors duration-300", done ? "text-brand-600" : "text-muted-foreground/70")} />
      {pick.label}
      <span className="mx-0.5 text-muted-foreground/60">·</span>
      <span className="relative grid whitespace-nowrap font-medium">
        <span className={cn("col-start-1 row-start-1 text-brand-700 transition-[opacity,filter] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]", done ? "opacity-100 blur-0" : "opacity-0 blur-[3px]")}>{pick.answer}</span>
        <span aria-hidden className={cn("col-start-1 row-start-1 my-auto h-2.5 rounded-full bg-muted-foreground/15 transition-opacity duration-300 motion-safe:animate-pulse", done && "opacity-0")} />
      </span>
    </span>
  )
}

export function Heading({ finished }: { finished: boolean }) {
  return (
    <h1 className="text-[44px] font-bold leading-[1.05] tracking-[-0.035em]">
      {finished ? (
        <Trans>
          Your book is <span className="bg-gradient-to-br from-brand-400 via-brand-600 to-brand-800 bg-clip-text text-transparent">ready</span>
        </Trans>
      ) : (
        <Trans>
          Getting to know <span className="bg-gradient-to-br from-brand-400 via-brand-600 to-brand-800 bg-clip-text text-transparent">your book</span>
        </Trans>
      )}
    </h1>
  )
}
