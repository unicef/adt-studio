import { useEffect, useState, type ReactNode } from "react"
import { Trans } from "@lingui/react/macro"
import { Check, ChevronDown, X } from "lucide-react"
import { useReducedEffects } from "@/lib/effects"
import { cn } from "@/lib/utils"
import type { StepSummary } from "../../../chat/useThread"
import { morphName, useMorph } from "./morph"

/** The folded step's one line ("receipt"): what was settled, and Change / Show / Hide. */
function PillFace({ summary, open, locked }: { summary: StepSummary; open: boolean; locked?: boolean }) {
  return (
    <>
      <span className={cn("grid size-5 shrink-0 place-items-center rounded-full text-white", summary.tone === "failed" ? "bg-destructive" : "bg-emerald-500")}>{summary.tone === "failed" ? <X className="size-3 stroke-[3]" /> : <Check className="size-3 stroke-[3]" />}</span>
      <span className="min-w-0 truncate">{summary.text}</span>
      <span className="shrink-0 text-[12.5px] font-semibold text-brand-700">{open ? <Trans>Hide</Trans> : locked ? <Trans>Show</Trans> : <Trans>Change</Trans>}</span>
      <ChevronDown className={cn("size-3.5 shrink-0 text-brand-700 transition-transform duration-200 motion-reduce:transition-none", open && "rotate-180")} />
    </>
  )
}

const PILL = "group inline-flex min-w-0 max-w-full cursor-pointer items-center gap-2 rounded-full bg-muted/60 py-1.5 pl-1.5 pr-3 text-left text-[13.5px] text-muted-foreground ring-1 ring-border/60 transition-colors hover:bg-muted hover:text-foreground"

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
        <button type="button" aria-expanded={false} onClick={() => morph(onToggle)} style={name} className={PILL}>
          <PillFace summary={summary} open={false} locked={locked} />
        </button>
      </div>
    )
  return (
    <div style={name} className="mb-3 rounded-[30px] bg-muted/45 p-5 ring-1 ring-border/70 shadow-[0_18px_44px_-30px_rgba(15,23,42,0.45)]">
      <div className="flex items-center gap-2 pl-[62px] [zoom:1.12]">
        <span className="grid size-5 shrink-0 place-items-center rounded-full bg-emerald-500 text-white">
          <Check className="size-3 stroke-[3]" />
        </span>
        <span className="min-w-0 flex-1 truncate text-[13.5px] text-muted-foreground">{summary.text}</span>
        <button type="button" aria-expanded onClick={() => morph(onToggle)} className="inline-flex h-8 shrink-0 items-center rounded-full bg-card px-3.5 text-[12.5px] font-semibold text-brand-700 ring-1 ring-brand-200 transition-colors hover:bg-brand-50">
          <Trans>Done</Trans>
        </button>
      </div>
      <div className="mt-4">{body}</div>
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
        <span className={PILL}>
          <PillFace summary={summary} open={open} locked={locked} />
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
          <button type="button" aria-expanded={open} onClick={onToggle} className={PILL}>
            <PillFace summary={summary} open={open} locked={locked} />
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
            <div className="rounded-[30px] bg-muted/40 px-4 py-4 ring-1 ring-border/60">{body}</div>
          </div>
        </div>
      )}
    </>
  )
}
