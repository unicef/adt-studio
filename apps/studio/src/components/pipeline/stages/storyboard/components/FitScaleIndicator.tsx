import { useCallback, useEffect, useRef, useState } from "react"
import { Maximize2 } from "lucide-react"
import { useLingui } from "@lingui/react/macro"
import { Badge } from "@/components/ui/badge"

const EXIT_MS = 220
const COUNT_MS = 550
const HOLD_MS = 2500

interface FitScaleIndicatorProps {
  /** On-screen width of the preview in CSS px (render width × scale). */
  visibleWidth: number
  /** The width the page renders at before scaling. */
  fullWidth: number
}

/**
 * A Dynamic-Island-style pill that floats centered under the topbar to tell the
 * user the storyboard is scaled to fit a narrow canvas.
 *
 * It is transient, not persistent: on many screens the canvas is narrower than
 * the page even with nothing open, so a permanent pill would just be noise.
 * Instead it flashes when the fit *changes* — a panel opens, the window
 * resizes — and once on mount, then recedes after {@link HOLD_MS}. It snaps out
 * immediately when the page returns to 1:1. Each appearance replays the
 * spring-in and the count-up; while it is already visible a live resize updates
 * the number instantly (a rolling number would only lag a value being dragged).
 */
export function FitScaleIndicator({ visibleWidth, fullWidth }: FitScaleIndicatorProps) {
  const { t } = useLingui()
  const fitPercent =
    visibleWidth && fullWidth ? Math.round((visibleWidth / fullWidth) * 100) : 100

  const [rendered, setRendered] = useState(false)
  const [open, setOpen] = useState(false)
  const [display, setDisplay] = useState(fitPercent)

  const fitRef = useRef(fitPercent)
  fitRef.current = fitPercent
  const prevFitRef = useRef(fitPercent)
  const mountedRef = useRef(false)
  const shownRef = useRef(false)
  const countRafRef = useRef<number | null>(null)
  const openRafRef = useRef<number | null>(null)
  const hideTimerRef = useRef<number | null>(null)
  const unmountTimerRef = useRef<number | null>(null)

  const startCountUp = useCallback(() => {
    if (countRafRef.current) cancelAnimationFrame(countRafRef.current)
    const reduce =
      // eslint-disable-next-line lingui/no-unlocalized-strings
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false
    if (reduce) {
      setDisplay(fitRef.current)
      countRafRef.current = null
      return
    }
    const from = 100
    let startTs: number | null = null
    const tick = (ts: number) => {
      if (startTs === null) startTs = ts
      const p = Math.min(1, (ts - startTs) / COUNT_MS)
      const eased = 1 - Math.pow(1 - p, 3)
      setDisplay(Math.round(from + (fitRef.current - from) * eased))
      countRafRef.current = p < 1 ? requestAnimationFrame(tick) : null
    }
    countRafRef.current = requestAnimationFrame(tick)
  }, [])

  const hidePill = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current)
      hideTimerRef.current = null
    }
    if (!shownRef.current) return
    shownRef.current = false
    if (openRafRef.current) cancelAnimationFrame(openRafRef.current)
    setOpen(false)
    unmountTimerRef.current = window.setTimeout(() => setRendered(false), EXIT_MS)
  }, [])

  const showPill = useCallback(() => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    if (unmountTimerRef.current) {
      clearTimeout(unmountTimerRef.current)
      unmountTimerRef.current = null
    }
    if (!shownRef.current) {
      shownRef.current = true
      setRendered(true)
      openRafRef.current = requestAnimationFrame(() => setOpen(true))
      startCountUp()
    }
    hideTimerRef.current = window.setTimeout(hidePill, HOLD_MS)
  }, [startCountUp, hidePill])

  // Drive visibility from changes in the fit, not from a persistent condition.
  useEffect(() => {
    const changed = fitPercent !== prevFitRef.current
    const first = !mountedRef.current
    prevFitRef.current = fitPercent
    mountedRef.current = true
    if (fitPercent >= 100) {
      hidePill()
      return
    }
    if (changed || first) showPill()
  }, [fitPercent, showPill, hidePill])

  // While the pill is already open, track the live value instantly.
  useEffect(() => {
    if (shownRef.current && countRafRef.current === null) setDisplay(fitPercent)
  }, [fitPercent])

  useEffect(
    () => () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
      if (unmountTimerRef.current) clearTimeout(unmountTimerRef.current)
      if (countRafRef.current) cancelAnimationFrame(countRafRef.current)
      if (openRafRef.current) cancelAnimationFrame(openRafRef.current)
    },
    [],
  )

  if (!rendered) return null

  return (
    <div className="pointer-events-none sticky top-0 z-20 flex h-0 justify-center">
      <Badge
        aria-hidden
        data-state={open ? "open" : "closed"}
        className="adt-fit-pill h-8 gap-2 border-transparent bg-violet-600 pl-3 pr-3.5 text-xs font-medium tabular-nums text-white shadow-lg shadow-violet-600/25 will-change-transform"
      >
        <Maximize2 className="h-3.5 w-3.5 opacity-70" aria-hidden />
        {t`Fit to panel · showing ${display}% of full size`}
      </Badge>
    </div>
  )
}
