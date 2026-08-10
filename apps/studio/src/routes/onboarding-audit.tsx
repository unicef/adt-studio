/* eslint-disable lingui/no-unlocalized-strings -- internal design-audit route, not shipped UI copy */
import { useState, type ComponentType } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { RotateCcw } from "lucide-react"
import { OnboardingCardBody } from "@/components/onboarding/OnboardingCardBody"
import { ONBOARDING_STEPS, type OnboardingStepProps } from "@/components/onboarding/steps"
import { ProviderSceneColor } from "@/components/onboarding/scenes/ProviderSceneColor"
import { ProviderSceneRail } from "@/components/onboarding/scenes/ProviderSceneRail"
import { ProviderSceneGuided } from "@/components/onboarding/scenes/ProviderSceneGuided"
import { ProviderSceneList } from "@/components/onboarding/scenes/ProviderSceneList"
import { FinaleSceneRecap } from "@/components/onboarding/scenes/FinaleSceneRecap"
import { usePageTitle } from "@/hooks/use-page-title"

export const Route = createFileRoute("/onboarding-audit")({
  component: OnboardingAuditPage,
})

const LABELS: Record<string, string> = {
  welcome: "Welcome",
  speech: "Speech",
  translations: "Translations",
  quizzes: "Quizzes",
  glossary: "Glossary",
  provider: "Connect a provider",
  finale: "Finale",
}

const noop = () => {}

type Variant = {
  key: string
  num: string
  label: string
  /** Chrome-position clone: provider variants sit mid-flow; finale is chrome-free. */
  index: number
  component: ComponentType<OnboardingStepProps>
  isLast?: boolean
}

const PROVIDER_INDEX = ONBOARDING_STEPS.findIndex((s) => s.id === "provider")

const VARIANTS: Variant[] = [
  {
    key: "provider-color",
    num: "A",
    label: "Provider — Variant A · colorful list + gradient constellation (Aside-inspired)",
    index: PROVIDER_INDEX,
    component: ProviderSceneColor,
  },
  {
    key: "provider-rail",
    num: "A2",
    label: "Provider — Variant A2 · icon rail (icons left, inputs right)",
    index: PROVIDER_INDEX,
    component: ProviderSceneRail,
  },
  {
    key: "provider-guided",
    num: "A′",
    label: "Provider — Variant A′ · guided cards + inline validation",
    index: PROVIDER_INDEX,
    component: ProviderSceneGuided,
  },
  {
    key: "provider-list",
    num: "B",
    label: "Provider — Variant B · grouped list, inline expand",
    index: PROVIDER_INDEX,
    component: ProviderSceneList,
  },
  {
    key: "finale-recap",
    num: "C",
    label: "Finale — cinematic + recap chips (alternative)",
    index: ONBOARDING_STEPS.length - 1,
    component: FinaleSceneRecap,
    isLast: true,
  },
]

/** Renders one onboarding screen at true 900×620 size — either a real step or a design variant. */
function ScreenTile({
  index,
  globalRound,
  num,
  label,
  component,
  isLast,
}: {
  index: number
  globalRound: number
  num: string
  label: string
  component?: ComponentType<OnboardingStepProps>
  isLast?: boolean
}) {
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
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-black/[0.08] bg-white px-2.5 py-1.5 text-xs font-medium text-[#5a5f68] shadow-sm transition-colors hover:text-[#0a0a0a] hover:border-black/20 cursor-pointer"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Replay
        </button>
      </div>
      <div
        key={`${globalRound}-${localRound}`}
        className="relative flex h-[620px] w-[900px] flex-col overflow-hidden rounded-[18px] border border-black/[0.08] bg-white text-[#0a0a0a] shadow-[0_30px_90px_-30px_rgba(20,32,80,0.4)]"
      >
        <OnboardingCardBody
          index={index}
          direction="forward"
          onNext={noop}
          onBack={noop}
          onFinish={noop}
          onSkip={noop}
          componentOverride={component}
          stepKeyOverride={component ? `${localRound}` : undefined}
          isLastOverride={isLast}
        />
      </div>
    </div>
  )
}

function OnboardingAuditPage() {
  usePageTitle("Onboarding — audit")
  const [globalRound, setGlobalRound] = useState(0)
  return (
    <div className="min-h-screen w-full overflow-auto bg-[radial-gradient(120%_120%_at_50%_-10%,#eaf1ff_0%,#eef0f5_55%,#e7e9ef_100%)] py-12">
      <div className="mx-auto mb-10 flex w-full max-w-[900px] items-start gap-4 px-1">
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight text-[#0a0a0a]">
            Onboarding — screen audit
          </h1>
          <p className="mt-1 text-sm text-[#737373]">
            All {ONBOARDING_STEPS.length} screens at their real 900×620 size, live with animations
            and interactions (cursor demos loop; the provider dialog opens). Navigation buttons are
            inert here so every screen stays visible.
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
        {ONBOARDING_STEPS.map((step, i) => (
          <ScreenTile
            key={i}
            index={i}
            globalRound={globalRound}
            num={String(i + 1).padStart(2, "0")}
            label={LABELS[step.id] ?? step.id}
          />
        ))}
      </div>

      <div className="mx-auto mt-16 mb-8 w-full max-w-[900px] px-1">
        <h2 className="text-xl font-bold tracking-tight text-[#0a0a0a]">Design variants</h2>
        <p className="mt-1 text-sm text-[#737373]">
          Alternatives under review for the provider and finale screens — not wired into the live
          flow. Rendered with identical chrome so they compare 1:1 with the real screens above.
        </p>
      </div>
      <div className="flex flex-col items-center gap-14">
        {VARIANTS.map((v) => (
          <ScreenTile
            key={v.key}
            index={v.index}
            globalRound={globalRound}
            num={v.num}
            label={v.label}
            component={v.component}
            isLast={v.isLast}
          />
        ))}
      </div>
    </div>
  )
}
