import { Trans } from "@lingui/react/macro"
import { cn } from "@/lib/utils"
import { FeatureScene } from "../FeatureScene"
import { DemoCursor } from "../shared/DemoCursor"
import { useDemoLoop } from "../shared/useDemoLoop"

function GlossaryDemo() {
  const phase = useDemoLoop(4, [1600, 850, 550, 2600])
  const atTerm = phase >= 1
  const open = phase >= 2
  const clicking = phase === 2
  const cursor = atTerm ? { x: 168, y: 56 } : { x: 258, y: 250 }
  return (
    <div className="relative h-[286px] w-[300px] rounded-2xl bg-white p-5 shadow-[0_18px_44px_-12px_rgba(6,20,60,0.45)]">
      <div className="text-[13px] font-bold text-[#0a0a0a]">
        <Trans>Chapter 2 · Plants</Trans>
      </div>
      <div className="mt-3.5 flex items-center gap-2">
        <div className="h-[6px] w-[38%] rounded-full bg-[#eef0f4]" />
        <span
          className={cn(
            "rounded-[6px] border px-1.5 py-0.5 text-[11px] font-semibold transition-colors",
            open ? "border-[#a3e635] bg-[#ecfccb] text-[#4d7c0f]" : "border-[#d9dde3] bg-[#f0f6e6] text-[#65a30d]",
          )}
        >
          photosynthesis
        </span>
      </div>
      <div className="mt-2.5 space-y-2.5">
        {[90, 78].map((w, i) => (
          <div key={i} className="h-[6px] rounded-full bg-[#eef0f4]" style={{ width: `${w}%` }} />
        ))}
      </div>
      <div
        className={cn(
          "absolute left-6 top-[104px] w-[240px] rounded-xl bg-[#0f1420] p-3.5 shadow-[0_14px_30px_-8px_rgba(0,0,0,0.4)] transition-all duration-300",
          open ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0",
        )}
      >
        <div className="text-[12.5px] font-bold text-[#bef264]">photosynthesis</div>
        <div className="mt-1.5 text-[11px] leading-relaxed text-[#c9cdd6]">
          <Trans>
            How plants turn sunlight, water and air into food — and give off
            oxygen.
          </Trans>
        </div>
      </div>
      <DemoCursor x={cursor.x} y={cursor.y} clicking={clicking} color="#65a30d" />
    </div>
  )
}

export function GlossaryScene() {
  return (
    <FeatureScene
      slug="glossary"
      panelLabel={<Trans>Glossary</Trans>}
      eyebrow={<Trans>Key terms</Trans>}
      title={<Trans>Tap any word you don't know.</Trans>}
      desc={
        <Trans>
          Hard terms become tappable — a clear, age-appropriate definition
          appears inline, without leaving the page.
        </Trans>
      }
      caption={<Trans>Definitions, one tap away.</Trans>}
    >
      <GlossaryDemo />
    </FeatureScene>
  )
}
