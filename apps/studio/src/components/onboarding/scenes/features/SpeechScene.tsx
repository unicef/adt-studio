import { useEffect, useState } from "react"
import { Play } from "lucide-react"
import { Trans } from "@lingui/react/macro"
import { cn } from "@/lib/utils"
import { FeatureScene } from "../FeatureScene"
import { DemoCursor } from "../shared/DemoCursor"
import { useDemoLoop } from "../shared/useDemoLoop"

const BARS = [10, 18, 26, 14, 22, 30, 16, 24, 12, 20, 28, 14, 18, 10]

function SpeechDemo() {
  const phase = useDemoLoop(4, [1500, 850, 550, 2600])
  const atPlay = phase >= 1
  const clicking = phase === 2
  // Play for a beat after the click, then settle — a clear ending (no endless loop).
  const [stopped, setStopped] = useState(false)
  useEffect(() => {
    if (phase < 2) return
    const t = setTimeout(() => setStopped(true), 2200)
    return () => clearTimeout(t)
  }, [phase])
  const playing = phase >= 2 && !stopped
  const played = phase >= 2
  const cursor = atPlay ? { x: 48, y: 234 } : { x: 258, y: 250 }
  return (
    <div className="relative h-[280px] w-[300px] rounded-2xl bg-[var(--ob-surface)] p-5 shadow-[0_18px_44px_-12px_rgba(6,20,60,0.45)]">
      <div className="text-[13px] font-bold text-[var(--ob-fg)]">
        <Trans>The Water Cycle</Trans>
      </div>
      <div className="mt-3.5 space-y-2.5">
        {[86, 96, 74].map((w, i) => (
          <div key={i} className="h-[6px] rounded-full bg-[var(--ob-track)]" style={{ width: `${w}%` }} />
        ))}
        <div
          className={cn("h-[6px] rounded-full transition-colors duration-300", played ? "bg-[#fda4af]" : "bg-[var(--ob-track)]")}
          style={{ width: "66%" }}
        />
      </div>
      <div className="absolute inset-x-5 bottom-5 flex items-center gap-3 rounded-xl bg-[#fff1f2] px-3 py-2.5">
        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#e11d48]">
          <Play className="h-3.5 w-3.5 text-white" fill="white" />
        </div>
        <div className="flex flex-1 items-center gap-[3px]">
          {BARS.map((h, i) => (
            <span
              key={i}
              className={cn("w-[3px] rounded-full", playing && "animate-onboarding-eq")}
              style={{
                height: h,
                backgroundColor: i < 7 ? "#e11d48" : "#fbc9d3",
                animationDelay: `${i * 60}ms`,
              }}
            />
          ))}
        </div>
        <span className="shrink-0 text-[11px] font-medium text-[var(--ob-muted)]">0:42</span>
      </div>
      <DemoCursor x={cursor.x} y={cursor.y} clicking={clicking} color="#e11d48" />
    </div>
  )
}

export function SpeechScene() {
  return (
    <FeatureScene
      slug="speech"
      panelLabel={<Trans>Narration</Trans>}
      eyebrow={<Trans>Read-aloud</Trans>}
      title={<Trans>Every page, read aloud.</Trans>}
      desc={
        <Trans>
          Natural narration for any book — students listen while they follow
          along, at their own pace.
        </Trans>
      }
      caption={<Trans>Tap play — the page speaks.</Trans>}
    >
      <SpeechDemo />
    </FeatureScene>
  )
}
