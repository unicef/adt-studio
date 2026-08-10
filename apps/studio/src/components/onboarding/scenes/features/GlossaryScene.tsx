import { Trans } from "@lingui/react/macro"
import { cn } from "@/lib/utils"
import { FeatureScene } from "../FeatureScene"
import { DemoCursor } from "../shared/DemoCursor"
import { useDemoLoop } from "../shared/useDemoLoop"

/* eslint-disable lingui/no-unlocalized-strings -- sample glossary content */
const TERM = {
  word: "Photosynthesis",
  emojis: "🌱 ☀️",
  def: "The process plants use to turn sunlight, water and carbon dioxide into food.",
}
/* eslint-enable lingui/no-unlocalized-strings */

function GlossaryDemo() {
  const phase = useDemoLoop(4, [1600, 850, 550, 2600])
  const atTerm = phase >= 1
  const open = phase >= 2
  const clicking = phase === 2
  const cursor = atTerm ? { x: 168, y: 56 } : { x: 258, y: 250 }
  return (
    <div className="relative h-[286px] w-[300px] rounded-2xl bg-[var(--ob-surface)] p-5 shadow-[0_18px_44px_-12px_rgba(6,20,60,0.45)]">
      <div className="text-[13px] font-bold text-[var(--ob-fg)]">
        <Trans>Chapter 2 · Plants</Trans>
      </div>
      <div className="mt-3.5 flex items-center gap-2">
        <div className="h-[6px] w-[38%] rounded-full bg-[var(--ob-track)]" />
        <span
          className={cn(
            "rounded-[6px] border px-1.5 py-0.5 text-[11px] font-semibold transition-colors",
            open
              ? "border-[#a3e635] bg-[#ecfccb] text-[#4d7c0f]"
              : "border-[#d9dde3] bg-[#f0f6e6] text-[#65a30d]",
          )}
        >
          photosynthesis
        </span>
      </div>
      <div className="mt-2.5 space-y-2.5">
        {[90, 78].map((w, i) => (
          <div key={i} className="h-[6px] rounded-full bg-[var(--ob-track)]" style={{ width: `${w}%` }} />
        ))}
      </div>

      {/* white definition popover */}
      <div
        className={cn(
          "absolute left-6 top-[104px] w-[248px] rounded-xl bg-[var(--ob-surface)] p-3.5 shadow-[0_16px_36px_-10px_rgba(6,20,60,0.28)] ring-1 ring-[var(--ob-border)] transition-all duration-300",
          open ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0",
        )}
      >
        <div className="relative flex items-baseline gap-1.5">
          <span className="text-[13px] font-bold text-[var(--ob-fg)]">{TERM.word}</span>
          <span className="text-[12px] leading-none">{TERM.emojis}</span>
        </div>
        <p className="relative mt-1.5 text-[11px] leading-relaxed text-[var(--ob-muted)]">{TERM.def}</p>
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
