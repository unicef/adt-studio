import { useEffect, useRef, useState } from "react"
import { Trans } from "@lingui/react/macro"
import { ArrowRight } from "lucide-react"
import { prefersReducedMotion } from "@/lib/utils"
import { ErrorDetails } from "../../errors/ErrorState"
import type { CreateRun } from "./useCreateRun"
import { useFinish } from "./finish"
import "./finish.css"

const R = 22
const C = 2 * Math.PI * R

/**
 * How far along creating looks: the server doesn't report progress, so saving eases towards 70%,
 * starting on the first pages towards 92%, and done is 100%.
 */
function useProgress(status: CreateRun["status"]) {
  const [p, setP] = useState(0.04)
  const since = useRef(performance.now())
  useEffect(() => {
    since.current = performance.now()
    if (status === "done") return setP(1)
    const [from, to] = status === "extracting" ? [0.7, 0.92] : [0.04, 0.7]
    const tick = () => setP(from + (to - from) * (1 - Math.exp(-(performance.now() - since.current) / 900)))
    tick()
    const id = window.setInterval(tick, 160)
    return () => window.clearInterval(id)
  }, [status])
  return p
}

/**
 * Progress ring becomes the button: one round object fills while the book is created, then
 * stretches into the brand-blue "Open the book" pill right where the eye already is; the small
 * caption under it says what it is doing, then that the book is ready.
 */
export function RingCreate({ run }: { run: CreateRun }) {
  const reduced = prefersReducedMotion()
  const finish = useFinish()
  const p = useProgress(run.status)
  const done = run.status === "done"
  const [morphed, setMorphed] = useState(done && reduced)
  const button = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!done) return setMorphed(false)
    const id = window.setTimeout(() => setMorphed(true), reduced ? 0 : 650)
    return () => window.clearTimeout(id)
  }, [done])
  useEffect(() => {
    if (!morphed) return
    const active = document.activeElement
    if (!active || active === document.body || !active.isConnected) button.current?.focus({ preventScroll: true })
  }, [morphed])

  return (
    <div className="flex flex-col items-start gap-3">
      <div className="flex w-[230px] flex-col items-center gap-3 py-2">
        <button
          ref={button}
          type="button"
          disabled={!morphed}
          onClick={() => run.label && finish?.onOpen(run.label)}
          data-done={morphed}
          aria-hidden={!morphed}
          tabIndex={morphed ? undefined : -1}
          className="fx-ring relative inline-flex shrink-0 items-center justify-center overflow-hidden text-[15px] font-semibold"
        >
          <svg viewBox="0 0 52 52" className="absolute left-0 top-0 size-[52px]" aria-hidden>
            <circle cx="26" cy="26" r={R} fill="none" strokeWidth="3.5" className="stroke-border" />
            <circle cx="26" cy="26" r={R} fill="none" strokeWidth="3.5" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - p)} className="p stroke-brand-600" />
          </svg>
          {morphed && (
            <span className="fx-label-in inline-flex items-center gap-2 whitespace-nowrap">
              <Trans>Open the book</Trans>
              <ArrowRight className="size-4" />
            </span>
          )}
        </button>
        <span key={morphed ? "ready" : run.status} className="fx-fade-in text-center font-mono text-[13px] text-muted-foreground">
          {morphed ? <Trans>{run.name} is set up</Trans> : run.status === "extracting" ? <Trans>Starting on the first pages…</Trans> : done ? <Trans>Done</Trans> : <Trans>Saving your book…</Trans>}
        </span>
      </div>
      {morphed && run.warning && <ErrorDetails detail={run.warning} className="items-start [&>button]:-ml-2" />}
    </div>
  )
}
