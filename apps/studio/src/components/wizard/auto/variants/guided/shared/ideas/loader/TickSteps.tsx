import { useEffect, useState } from "react"
import { useLingui } from "@lingui/react/macro"
import { cn } from "@/lib/utils"

/** The first step (the PDF's own facts) is quick; it ticks on time, not on a signal. */
const FIRST_STEP_S = 3
const LAST_STEP_MS = 450

type State = "todo" | "now" | "done"

/**
 * c14: what the engine does, in three loose steps. A step shows up only once it starts: it spins,
 * then pops a check and dims so the current one stands out. Only the first ticks on time (reading
 * the PDF's own facts takes a moment); the readings and the settings tick when the answer is in,
 * because the engine says nothing before that.
 */
export function TickSteps({ seconds, done }: { seconds: number; done: boolean }) {
  const { t } = useLingui()
  const [last, setLast] = useState(done)
  useEffect(() => {
    if (!done) return
    const id = window.setTimeout(() => setLast(true), LAST_STEP_MS)
    return () => window.clearTimeout(id)
  }, [done])
  const first: State = done || seconds >= FIRST_STEP_S ? "done" : "now"
  const steps: { label: string; state: State }[] = [
    { label: t`Looking over the pages`, state: first },
    { label: t`Reading it two ways`, state: done ? "done" : first === "done" ? "now" : "todo" },
    { label: t`Choosing the settings`, state: last ? "done" : done ? "now" : "todo" },
  ]
  return (
    <ol className="flex flex-col gap-2.5 text-[16px]">
      {steps
        .filter((s) => s.state !== "todo")
        .map((s) => (
          <li key={s.label} className={cn("lcl-row flex items-center gap-3 transition-colors duration-300", s.state === "done" ? "text-muted-foreground" : "text-foreground")}>
            <Icon state={s.state} />
            <span>{s.label}</span>
            <span className="sr-only">{s.state === "done" ? t`done` : t`in progress`}</span>
          </li>
        ))}
    </ol>
  )
}

function Icon({ state }: { state: State }) {
  return (
    <span aria-hidden className="relative size-[18px] shrink-0">
      {state === "done" ? (
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="lcl-check absolute inset-0 size-full text-brand-600">
          <path d="M3 8.5l3 3 7-7" />
        </svg>
      ) : (
        <span className="lcl-spin absolute inset-0.5 rounded-full border-2 border-brand-600/25 border-t-brand-600" />
      )}
    </span>
  )
}
