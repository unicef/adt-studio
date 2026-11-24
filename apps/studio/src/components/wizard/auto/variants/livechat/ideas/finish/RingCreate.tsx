import { useEffect, useRef, useState } from "react"
import { Trans } from "@lingui/react/macro"
import { BookOpen } from "lucide-react"
import { useReducedEffects } from "@/lib/effects"
import { ErrorDetails } from "../../../../errors/ErrorState"
import type { CreateRun } from "../../../chat/useCreateRun"
import { useFinish } from "./context"
import "./finish.css"

const R = 21
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
 * f26 · Progress ring becomes the button: one object fills while the book is created, then
 * stretches into "Open the book" right where the eye already is.
 */
export function RingCreate({ run }: { run: CreateRun }) {
  const reduced = useReducedEffects()
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
      {morphed && (
        <p className="fx-fade-in font-semibold">
          <Trans>{run.name} is ready</Trans>
        </p>
      )}
      <div className="flex items-center gap-3.5">
        <button
          ref={button}
          type="button"
          disabled={!morphed}
          onClick={() => run.label && finish?.onOpen(run.label)}
          data-done={morphed}
          aria-hidden={!morphed}
          tabIndex={morphed ? undefined : -1}
          className="fx-ring relative inline-flex shrink-0 items-center justify-center overflow-hidden bg-muted/70 text-[15px] font-semibold text-primary-foreground [interpolate-size:allow-keywords] data-[done=true]:bg-brand-600 data-[done=true]:shadow-[0_10px_26px_-8px_rgba(43,127,255,0.75)] data-[done=true]:hover:bg-brand-600/90 data-[done=true]:active:scale-[0.97]"
        >
          <svg viewBox="0 0 48 48" className="absolute left-0 top-0 size-12" aria-hidden>
            <circle cx="24" cy="24" r={R} fill="none" strokeWidth="3.5" className="stroke-border" />
            <circle cx="24" cy="24" r={R} fill="none" strokeWidth="3.5" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - p)} className="p stroke-brand-600" />
          </svg>
          {morphed && (
            <span className="fx-label-in inline-flex items-center gap-2 whitespace-nowrap">
              <BookOpen className="size-4" />
              <Trans>Open the book</Trans>
            </span>
          )}
        </button>
        {!morphed && (
          <span className="text-[15px] text-muted-foreground">
            {done ? <Trans>Done</Trans> : run.status === "extracting" ? <Trans>Starting on the first pages…</Trans> : <Trans>Saving your book…</Trans>}
          </span>
        )}
      </div>
      {morphed && run.warning && <ErrorDetails detail={run.warning} className="items-start [&>button]:-ml-2" />}
    </div>
  )
}
