import { useEffect, useState, type ReactNode } from "react"
import { Trans } from "@lingui/react/macro"
import { Check, ChevronDown, ChevronRight, X } from "lucide-react"
import { useReducedEffects } from "@/lib/effects"
import { cn } from "@/lib/utils"
import type { StepSummary } from "../../../chat/useThread"
import { morphName, useMorph } from "./morph"

/** The folded step's one line: a check, what was settled, and the idea's own way to open it. */
function PillFace({ summary, open, locked, face }: { summary: StepSummary; open: boolean; locked?: boolean; face: "b6" | "b8" | "b11" }) {
  const failed = summary.tone === "failed"
  const action = open ? <Trans>Hide</Trans> : locked ? <Trans>Show</Trans> : <Trans>Change</Trans>
  return (
    <>
      {failed ? <X className="size-4 shrink-0 stroke-[2.6] text-destructive" /> : <Check className="size-4 shrink-0 stroke-[2.6] text-emerald-500" />}
      <span className={cn("min-w-0 truncate", face === "b8" && "font-medium text-foreground")}>{summary.text}</span>
      {face === "b6" && <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground" />}
      {face === "b8" && <ChevronDown aria-hidden className={cn("ml-auto size-4 shrink-0 text-muted-foreground transition-transform duration-300 motion-reduce:transition-none", open && "rotate-180")} />}
      {face === "b11" && <span className="ml-auto shrink-0 pl-2 text-[13px] font-medium text-[var(--lc-accent-text)]">{action}</span>}
      {face !== "b11" && <span className="sr-only">{action}</span>}
    </>
  )
}

/** b6: the board's closed bubble ("Pick a look ›"), one soft surface that grows into the panel. */
const PILL_B6 = "ix-pill inline-flex min-w-0 max-w-full cursor-pointer items-center gap-2 rounded-full py-2 pl-3 pr-3.5 text-left text-[14px] text-muted-foreground transition-colors hover:text-foreground"
/** b8: a small card whose caret turns as it slides open. */
const PILL_B8 = "ix-pill flex w-[min(100%,460px)] cursor-pointer items-center gap-2.5 rounded-[14px] px-3.5 py-2.5 text-left text-[14px] text-muted-foreground"
/** b11: a one-line receipt with Change at its end. */
const PILL_B11 = "ix-pill flex w-[min(100%,460px)] cursor-pointer items-center gap-2 rounded-full py-1.5 pl-3 pr-3.5 text-left text-[13.5px] text-muted-foreground transition-colors hover:text-foreground"

type Props = { idea: string; step: string; summary: StepSummary; open: boolean; locked: boolean; onToggle: () => void; body: ReactNode; fresh: boolean }

/**
 * A step the thread moved past, for the "expand" ideas: b6 the line grows into a panel (one surface,
 * View Transitions), b8 a native `<details>` that slides to its real height, b11 the answered step
 * shrinks into its one-line receipt. Any other idea keeps the Living chat fold.
 */
export function FoldedStep(props: Props) {
  if (props.idea === "b6") return <PanelStep {...props} />
  if (props.idea === "b8") return <DetailsStep {...props} />
  return <ReceiptStep {...props} />
}

/** b6: the pill and the open panel share a view-transition name, so the pill stretches into the panel. */
function PanelStep({ step, summary, open, locked, onToggle, body }: Props) {
  const morph = useMorph()
  const name = morphName(`ix-step-${step}`)
  if (!open)
    return (
      <div className="flex pl-[62px] [zoom:1.12]">
        <button type="button" aria-expanded={false} onClick={() => morph(onToggle)} style={name} className={PILL_B6}>
          <PillFace summary={summary} open={false} locked={locked} face="b6" />
        </button>
      </div>
    )
  return (
    <div style={name} className="lc-surface mb-3 p-5">
      <div className="flex items-center gap-2 pl-[62px] [zoom:1.12]">
        <Check className="size-4 shrink-0 stroke-[2.6] text-emerald-500" />
        <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium">{summary.text}</span>
      </div>
      <div className="mt-4">{body}</div>
      <div className="mt-2 pl-[62px]">
        <button type="button" aria-expanded onClick={() => morph(onToggle)} className="lc-btn h-9 px-4 text-[13.5px]">
          <Trans>Done</Trans>
        </button>
      </div>
    </div>
  )
}

/** b8: a native details element; CSS animates it to height: auto with no measuring. */
function DetailsStep({ summary, open, locked, onToggle, body }: Props) {
  return (
    <details
      className="ix-details"
      open={open}
      onToggle={(e) => {
        if (e.currentTarget.open !== open) onToggle()
      }}
    >
      <summary className="flex pl-[62px] [zoom:1.12] [&::marker]:hidden">
        <span className={PILL_B8}>
          <PillFace summary={summary} open={open} locked={locked} face="b8" />
        </span>
      </summary>
      <div className="mb-5 mt-4">{body}</div>
    </details>
  )
}

/**
 * b11: when a step has just been answered, its messages stay for a beat in a shell, then the shell
 * shrinks to nothing as the one-line receipt settles in its place. Reopening it is the usual fold.
 */
function ReceiptStep({ summary, open, locked, onToggle, body, fresh }: Props) {
  const reduced = useReducedEffects()
  const [phase, setPhase] = useState<"full" | "folding" | "folded">(fresh && !reduced ? "full" : "folded")
  useEffect(() => {
    if (phase === "folded") return
    const id = window.setTimeout(() => setPhase(phase === "full" ? "folding" : "folded"), phase === "full" ? 420 : 560)
    return () => window.clearTimeout(id)
  }, [phase])
  return (
    <>
      {phase !== "full" && (
        <div className={cn("flex pl-[62px] [zoom:1.12]", fresh && "ix-receipt-in")}>
          <button type="button" aria-expanded={open} onClick={onToggle} className={PILL_B11}>
            <PillFace summary={summary} open={open} locked={locked} face="b11" />
          </button>
        </div>
      )}
      {phase === "folded" ? (
        <div className="lc-fold" data-open={open} inert={!open}>
          <div>
            <div className="mb-5 mt-4">{body}</div>
          </div>
        </div>
      ) : (
        <div className="ix-receipt-shell ix-still" data-folded={phase === "folding"} inert>
          <div>
            <div className="lc-surface px-4 py-4">{body}</div>
          </div>
        </div>
      )}
    </>
  )
}
