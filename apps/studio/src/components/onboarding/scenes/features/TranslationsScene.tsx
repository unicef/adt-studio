import { Trans } from "@lingui/react/macro"
import { cn } from "@/lib/utils"
import { FeatureScene } from "../FeatureScene"
import { DemoCursor } from "../shared/DemoCursor"
import { useDemoLoop } from "../shared/useDemoLoop"

// eslint-disable-next-line lingui/no-unlocalized-strings -- language codes, not UI copy
const LANGS = ["EN", "PT", "ES", "FR"]

function TranslationsDemo() {
  const phase = useDemoLoop(4, [1600, 850, 550, 2600])
  const atPill = phase >= 1
  const translated = phase >= 2
  const clicking = phase === 2
  const cursor = atPill ? { x: 78, y: 34 } : { x: 258, y: 250 }
  // eslint-disable-next-line lingui/no-unlocalized-strings -- language codes, not UI copy
  const active = translated ? "PT" : "EN"
  return (
    <div className="relative h-[280px] w-[300px] rounded-2xl bg-[var(--ob-surface)] p-5 shadow-[0_18px_44px_-12px_rgba(6,20,60,0.45)]">
      <div className="flex gap-1.5">
        {LANGS.map((l) => (
          <span
            key={l}
            className={cn(
              "rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors duration-300",
              l === active ? "bg-[#fbe8f3] text-[#db2777]" : "bg-[#f4f4f6] text-[var(--ob-faint)]",
            )}
          >
            {l}
          </span>
        ))}
      </div>
      <div className="mt-4 text-[14px] font-bold text-[var(--ob-fg)]">
        {/* eslint-disable-next-line lingui/no-unlocalized-strings -- sample book content */}
        {translated ? "O Ciclo da Água" : "The Water Cycle"}
      </div>
      <div className="mt-3 space-y-2.5">
        {[92, 82, 88, 68].map((w, i) => (
          <div key={i} className="h-[6px] rounded-full bg-[var(--ob-track)]" style={{ width: `${w}%` }} />
        ))}
      </div>
      <div
        className={cn(
          "absolute bottom-5 left-5 flex items-center gap-1.5 rounded-full px-2.5 py-1.5 transition-all duration-300",
          translated ? "bg-[#db2777] opacity-100" : "opacity-0",
        )}
      >
        <span className="h-2 w-2 rounded-full bg-white" />
        <span className="text-[11px] font-semibold text-white">
          <Trans>Translated to PT</Trans>
        </span>
      </div>
      <DemoCursor x={cursor.x} y={cursor.y} clicking={clicking} color="#db2777" />
    </div>
  )
}

export function TranslationsScene() {
  return (
    <FeatureScene
      slug="translate"
      panelLabel={<Trans>Translation</Trans>}
      eyebrow={<Trans>Multilingual</Trans>}
      title={<Trans>Read it in their language.</Trans>}
      desc={
        <Trans>
          Every page translated and kept in sync — Portuguese, Spanish, French
          and more, without losing the layout.
        </Trans>
      }
      caption={<Trans>Switch languages in a tap.</Trans>}
    >
      <TranslationsDemo />
    </FeatureScene>
  )
}
