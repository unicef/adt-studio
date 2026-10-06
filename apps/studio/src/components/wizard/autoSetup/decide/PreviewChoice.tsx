import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { Trans } from "@lingui/react/macro"
import { BookImage, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Question } from "./questions"
import { DeviceToggle, Preview, isAi, type Device } from "./strategies"
import { DetailPanel, type PanelView } from "./choice/DetailPanel"
import { PickCards } from "./choice/PickCards"
import { SWAP } from "../ui"

function useStageHeight() {
  const calc = () => Math.max(300, Math.min(600, window.innerHeight - 530))
  const [h, setH] = useState(calc)
  useEffect(() => {
    const onResize = () => setH(calc())
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [])
  return h
}

/** The free space inside the stage, so the device always fills it (by width or height, whichever binds). */
function useBox() {
  const ref = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ w: 0, h: 0 })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return { ref, box }
}


/**
 * The page-look choice: the allowed strategies (the AI's two picks first), one big preview, and the
 * selected strategy explained beside it. Fixed layout and templates are previewed on the book's own
 * page; AI-powered ones show an example, clearly labelled. Only the AI's two picks are on screen; the
 * other looks live behind "Advanced" (a popover). The picks are shown as two cards.
 */
export function PreviewChoice({ question, page, spread, value, onChange }: { question: Question; page?: string; spread?: boolean; value: string; onChange: (v: string) => void }) {
  const [device, setDevice] = useState<Device>("desktop")
  const candidates = question.candidates.map((id) => question.options.find((o) => o.value === id)).filter((o) => o !== undefined)
  const others = question.options.filter((o) => !question.candidates.includes(o.value))
  const option = question.options.find((o) => o.value === value) ?? candidates[0]
  const ai = isAi(option.value)
  const stage = useStageHeight() - 40
  const [view, setView] = useState<PanelView>("overview")
  const { ref: areaRef, box } = useBox()
  const fit = (ratio: number, maxW: number) => Math.max(120, Math.min(maxW, box.w - 32, (box.h - 16) / ratio))
  const width = Math.round(device === "desktop" ? fit(0.64, 760) : fit(2.05, 250))
  const pick = question.candidates.indexOf(option.value)
  const switcher = { candidates, others, value, onChange, page }

  return (
    <div className="flex flex-col gap-3">
      <PickCards {...switcher} />

      <div className="grid grid-cols-[1fr_400px] items-stretch gap-5">
        <div style={{ minHeight: stage }} className="relative flex flex-col overflow-hidden rounded-[26px] bg-gradient-to-br from-brand-50 via-muted/40 to-brand-100/70 ring-1 ring-brand-100">
          <div className="flex items-center justify-between gap-3 px-4 pt-3">
            <span className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-semibold shadow-sm", ai ? "bg-brand-600 text-primary-foreground" : "bg-card text-foreground ring-1 ring-border")}>
              {ai ? <Sparkles className="size-3.5" /> : <BookImage className="size-3.5" />}
              {ai ? <Trans>Example — the AI designs each of your pages</Trans> : spread ? <Trans>Shown with your own pages · two-page spread</Trans> : <Trans>Shown with your own page</Trans>}
            </span>
            <DeviceToggle value={device} onChange={setDevice} />
          </div>
          <div ref={areaRef} className="grid min-h-0 flex-1 place-items-center pb-4">
            <div key={`${option.value}-${device}`} className={SWAP}>
              <Preview id={option.value} device={device} width={width} page={page} />
            </div>
          </div>
        </div>

        <DetailPanel key={option.value} option={option} pick={pick >= 0 ? pick : undefined} view={view} onView={setView} />
      </div>
    </div>
  )
}
