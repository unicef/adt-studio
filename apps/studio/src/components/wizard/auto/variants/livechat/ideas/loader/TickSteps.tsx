import { useEffect, useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { Check } from "lucide-react"
import { cn } from "@/lib/utils"

/** The first step (the PDF's own facts) is quick; it ticks on time, not on a signal. */
const FIRST_STEP_S = 3
const LAST_STEP_MS = 450

type State = "todo" | "now" | "done"

/**
 * c14: what the engine does, in three loose steps. Only the first ticks on time (reading the PDF's
 * own facts takes a moment); the readings and the settings tick when the answer is in, because
 * the engine says nothing before that. The step in progress shows the real seconds so far.
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
    <ol className="flex flex-col gap-2 text-[16px]">
      {steps.map((s) => (
        <li key={s.label} className={cn("lcl-row flex items-center gap-2.5 transition-colors duration-300", s.state === "done" ? "text-muted-foreground" : s.state === "now" ? "font-semibold text-foreground" : "text-muted-foreground/70")}>
          <Icon state={s.state} />
          <span>{s.label}</span>
          {s.state === "now" && !done && (
            <span className="text-[14px] font-medium tabular-nums text-muted-foreground">
              <Trans comment="Seconds spent so far on the current step">· {seconds} s</Trans>
            </span>
          )}
          <span className="sr-only">{s.state === "done" ? t`done` : s.state === "now" ? t`in progress` : t`to do`}</span>
        </li>
      ))}
    </ol>
  )
}

function Icon({ state }: { state: State }) {
  if (state === "done")
    return (
      <span aria-hidden className="lcl-check grid size-5 shrink-0 place-items-center rounded-full bg-emerald-500 text-white">
        <Check className="size-3.5" strokeWidth={3} />
      </span>
    )
  if (state === "now") return <span aria-hidden className="lcl-spin size-5 shrink-0 rounded-full border-[2.5px] border-brand-200 border-t-brand-600" />
  return <span aria-hidden className="size-5 shrink-0 rounded-full border-2 border-dashed border-muted-foreground/40" />
}
