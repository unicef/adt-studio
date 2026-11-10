import { useLingui } from "@lingui/react/macro"
import { Check, X } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Verdict } from "./judgeStore"

const BASE = cn(
  "group/verdict flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-[12px] font-semibold",
  "transition-[background-color,border-color,color,box-shadow] duration-200 ease-out motion-reduce:transition-none",
  "outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-offset-card",
)

const TONE: Record<Verdict, { on: string; off: string; key: string }> = {
  right: {
    on: "border-emerald-600 bg-emerald-600 text-white shadow-sm dark:border-emerald-500 dark:bg-emerald-500 dark:text-emerald-950 focus-visible:ring-emerald-500/50",
    off: "border-emerald-600/35 bg-card text-emerald-700 hover:bg-emerald-500/10 dark:border-emerald-400/35 dark:text-emerald-300 focus-visible:ring-emerald-500/50",
    key: "A",
  },
  wrong: {
    on: "border-amber-600 bg-amber-600 text-white shadow-sm dark:border-amber-400 dark:bg-amber-400 dark:text-amber-950 focus-visible:ring-amber-500/50",
    off: "border-amber-600/40 bg-card text-amber-800 hover:bg-amber-500/10 dark:border-amber-400/35 dark:text-amber-300 focus-visible:ring-amber-500/50",
    key: "D",
  },
}

function KeyHint({ value, on }: { value: string; on: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "ml-0.5 rounded border px-1 font-mono text-[10px] leading-4 transition-colors duration-200 motion-reduce:transition-none",
        on ? "border-current/30 opacity-80" : "border-current/25 opacity-60 group-hover/verdict:opacity-90",
      )}
    >
      {value}
    </span>
  )
}

export function VerdictButtons({ verdict, onPick }: { verdict: Verdict | null; onPick: (verdict: Verdict) => void }) {
  const { t } = useLingui()
  const options: { value: Verdict; label: string; title: string }[] = [
    { value: "right", label: t`Right to leave out`, title: t`The filter was right to leave it out (A or 1)` },
    { value: "wrong", label: t`Should be kept`, title: t`The book needs this image (D or 2)` },
  ]
  return (
    <div role="group" aria-label={t`Your verdict`} className="flex shrink-0 items-center gap-1.5" data-judge-verdicts>
      {options.map((option) => {
        const on = verdict === option.value
        const Icon = option.value === "right" ? Check : X
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={on}
            title={option.title}
            onClick={() => onPick(option.value)}
            data-judge-verdict={option.value}
            className={cn(BASE, on ? TONE[option.value].on : TONE[option.value].off)}
          >
            <Icon className={cn("size-3.5 transition-transform duration-200 motion-reduce:transition-none", on && "scale-110")} strokeWidth={2.6} aria-hidden />
            {option.label}
            <KeyHint value={TONE[option.value].key} on={on} />
          </button>
        )
      })}
    </div>
  )
}
