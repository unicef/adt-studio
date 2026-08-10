import { Search, X } from "lucide-react"
import { Trans } from "@lingui/react/macro"
import { cn } from "@/lib/utils"
import { FeatureScene } from "../FeatureScene"
import { DemoCursor } from "../shared/DemoCursor"
import { useDemoLoop } from "../shared/useDemoLoop"

/* eslint-disable lingui/no-unlocalized-strings -- sample glossary content */
const ENTRIES = [
  { word: "Photosynthesis", emojis: "🌱 ☀️", def: "The process plants use to turn sunlight, water and carbon dioxide into food." },
  { word: "Ecosystem", emojis: "🌿 🦊", def: "The living things in a place and how they interact with their environment." },
]
/* eslint-enable lingui/no-unlocalized-strings */

function GlossaryDemo() {
  const phase = useDemoLoop(4, [1600, 850, 550, 2600])
  const atToggle = phase >= 1
  const on = phase >= 2
  const clicking = phase === 2
  const cursor = atToggle ? { x: 268, y: 62 } : { x: 258, y: 250 }
  return (
    <div className="relative h-[286px] w-[300px] rounded-2xl bg-gradient-to-b from-lime-50/60 via-white to-white p-4 shadow-[0_18px_44px_-12px_rgba(6,20,60,0.45)]">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-bold text-[#0a0a0a]">
          <Trans>Glossary</Trans>
        </span>
        <X className="h-3.5 w-3.5 text-[#a3a3a3]" strokeWidth={2} />
      </div>

      <div className="mt-3 flex items-center justify-between">
        <span className="text-[11.5px] font-medium text-[#0a0a0a]">
          <Trans>Highlight words</Trans>
        </span>
        <span
          className={cn(
            "flex h-4 w-7 items-center rounded-full px-0.5 transition-colors duration-300",
            on ? "justify-end bg-[#65a30d]" : "justify-start bg-neutral-200",
          )}
        >
          <span className="h-3 w-3 rounded-full bg-white shadow-sm" />
        </span>
      </div>

      <div className="mt-3 flex items-center gap-2 rounded-full bg-[#f5f5f5] px-3 py-1.5">
        <Search className="h-3 w-3 text-[#a3a3a3]" strokeWidth={2} />
        <span className="text-[11px] text-[#a3a3a3]">
          <Trans>Search…</Trans>
        </span>
      </div>

      <div className="mt-3.5 space-y-3">
        {ENTRIES.map((e) => (
          <div key={e.word} className="flex flex-col gap-0.5">
            <div className="flex items-baseline gap-1.5">
              <span
                className={cn(
                  "rounded px-1 text-[12.5px] font-semibold transition-colors duration-300",
                  on ? "bg-lime-100 text-[#4d7c0f]" : "text-[#0a0a0a]",
                )}
              >
                {e.word}
              </span>
              <span className="text-[11px] leading-none">{e.emojis}</span>
            </div>
            <p className="line-clamp-2 text-[11px] leading-snug text-[#737373]">{e.def}</p>
          </div>
        ))}
        <p aria-hidden className="pt-0.5 text-center tracking-[0.4em] text-lime-400/70">
          ···
        </p>
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
      caption={<Trans>Every key term, defined.</Trans>}
    >
      <GlossaryDemo />
    </FeatureScene>
  )
}
