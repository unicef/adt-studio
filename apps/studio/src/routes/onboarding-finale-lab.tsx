/* eslint-disable lingui/no-unlocalized-strings -- internal design-lab route, not shipped UI copy */
import { useState, type ComponentType } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { RotateCcw } from "lucide-react"
import type { OnboardingStepProps } from "@/components/onboarding/steps"
import { FinaleSceneRecap } from "@/components/onboarding/scenes/FinaleSceneRecap"
import { FinaleLuminous } from "@/components/onboarding/scenes/FinaleLuminous"
import { FinaleAurora } from "@/components/onboarding/scenes/FinaleAurora"
import { usePageTitle } from "@/hooks/use-page-title"

export const Route = createFileRoute("/onboarding-finale-lab")({
  component: FinaleLabPage,
})

const noop = () => {}

type Variant = {
  id: string
  num: string
  label: string
  note: string
  component: ComponentType<OnboardingStepProps>
}

const VARIANTS: Variant[] = [
  {
    id: "luminous",
    num: "A",
    label: "Luminous (light)",
    note: "Exaggerated-minimal, consistent with the light flow: oversized type on warm white, one blue accent, soft feature-colored aurora, masked line-rise reveal. No screenshot.",
    component: FinaleLuminous,
  },
  {
    id: "aurora",
    num: "B",
    label: "Aurora (dark, cinematic)",
    note: "One designed frame — the four feature hues + accessibility blue woven into a slow-flowing aurora, oversized type, masked reveal, single CTA. No screenshot.",
    component: FinaleAurora,
  },
  {
    id: "current",
    num: "C",
    label: "Old live finale (for reference)",
    note: "The current shipping recap — app screenshot rising behind a static vignette (the collage we're replacing).",
    component: FinaleSceneRecap,
  },
]

function LabTile({
  num,
  label,
  note,
  component: Component,
  globalRound,
}: Variant & { globalRound: number }) {
  const [localRound, setLocalRound] = useState(0)
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 px-1">
        <span className="font-mono text-xs font-semibold text-[#3b82f7]">{num}</span>
        <span className="text-sm font-semibold text-[#0a0a0a]">{label}</span>
        <span className="font-mono text-[11px] text-[#9aa0aa]">900 × 620</span>
        <button
          type="button"
          onClick={() => setLocalRound((r) => r + 1)}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-black/[0.08] bg-white px-2.5 py-1.5 text-xs font-medium text-[#5a5f68] shadow-sm transition-colors hover:border-black/20 hover:text-[#0a0a0a] cursor-pointer"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Replay
        </button>
      </div>
      <p className="max-w-[900px] px-1 text-xs text-[#737373]">{note}</p>
      <div
        key={`${globalRound}-${localRound}`}
        className="relative flex h-[620px] w-[900px] flex-col overflow-hidden rounded-[18px] border border-black/[0.08] bg-white shadow-[0_30px_90px_-30px_rgba(20,32,80,0.4)]"
      >
        <Component onNext={noop} onBack={noop} onFinish={noop} onSkip={noop} isFirst={false} isLast />
      </div>
    </div>
  )
}

function FinaleLabPage() {
  usePageTitle("Onboarding — finale lab")
  const [globalRound, setGlobalRound] = useState(0)
  return (
    <div className="min-h-screen w-full overflow-auto bg-[radial-gradient(120%_120%_at_50%_-10%,#eaf1ff_0%,#eef0f5_55%,#e7e9ef_100%)] py-12">
      <div className="mx-auto mb-10 flex w-full max-w-[900px] items-start gap-4 px-1">
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight text-[#0a0a0a]">
            Onboarding — finale lab
          </h1>
          <p className="mt-1 text-sm text-[#737373]">
            Cinematic ending variants based on Arc's orb→window reveal and the
            Linear/Vercel/Raycast product-as-hero principle. Each plays once at real
            900×620 size; hit Replay to watch again. Buttons are inert here.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setGlobalRound((r) => r + 1)}
          className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-[#3b82f7] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_8px_20px_-4px_rgba(59,130,247,0.45)] transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 cursor-pointer"
        >
          <RotateCcw className="h-4 w-4" />
          Replay all
        </button>
      </div>
      <div className="flex flex-col items-center gap-14">
        {VARIANTS.map((v) => (
          <LabTile key={v.id} {...v} globalRound={globalRound} />
        ))}
      </div>
    </div>
  )
}
