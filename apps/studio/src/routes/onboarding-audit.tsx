/* eslint-disable lingui/no-unlocalized-strings -- internal design-audit route, not shipped UI copy */
import { createFileRoute } from "@tanstack/react-router"
import { OnboardingCardBody } from "@/components/onboarding/OnboardingCardBody"
import { ONBOARDING_STEPS } from "@/components/onboarding/steps"
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

/** Renders one onboarding screen locked to its index, at true 900×620 size. */
function ScreenTile({ index }: { index: number }) {
  const step = ONBOARDING_STEPS[index]
  const num = String(index + 1).padStart(2, "0")
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline gap-2 px-1">
        <span className="font-mono text-xs font-semibold text-[#3b82f7]">{num}</span>
        <span className="text-sm font-semibold text-[#0a0a0a]">{LABELS[step.id] ?? step.id}</span>
        <span className="font-mono text-[11px] text-[#9aa0aa]">900 × 620</span>
      </div>
      <div className="relative flex h-[620px] w-[900px] flex-col overflow-hidden rounded-[18px] border border-black/[0.08] bg-white text-[#0a0a0a] shadow-[0_30px_90px_-30px_rgba(20,32,80,0.4)]">
        <OnboardingCardBody
          index={index}
          direction="forward"
          onNext={noop}
          onBack={noop}
          onFinish={noop}
          onSkip={noop}
        />
      </div>
    </div>
  )
}

function OnboardingAuditPage() {
  usePageTitle("Onboarding — audit")
  return (
    <div className="min-h-screen w-full overflow-auto bg-[radial-gradient(120%_120%_at_50%_-10%,#eaf1ff_0%,#eef0f5_55%,#e7e9ef_100%)] py-12">
      <div className="mx-auto mb-10 w-full max-w-[900px] px-1">
        <h1 className="text-2xl font-bold tracking-tight text-[#0a0a0a]">
          Onboarding — screen audit
        </h1>
        <p className="mt-1 text-sm text-[#737373]">
          All {ONBOARDING_STEPS.length} screens at their real 900×620 size, live with animations
          and interactions (cursor demos loop; the provider dialog opens). Navigation buttons are
          inert here so every screen stays visible.
        </p>
      </div>
      <div className="flex flex-col items-center gap-14">
        {ONBOARDING_STEPS.map((_, i) => (
          <ScreenTile key={i} index={i} />
        ))}
      </div>
    </div>
  )
}
