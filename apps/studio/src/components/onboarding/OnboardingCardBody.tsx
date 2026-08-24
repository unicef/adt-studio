import { Trans } from "@lingui/react/macro";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { OnboardingStepContainer } from "./OnboardingLayout";
import { OnboardingProgress } from "./OnboardingProgress";
import { ONBOARDING_STEPS } from "./steps";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DRAG_REGION, NO_DRAG_REGION } from "@/constants";

export type OnboardingCardHandlers = {
  onNext: () => void;
  onBack: () => void;
  onFinish: () => void;
  onSkip: () => void;
};

/**
 * The interior of the onboarding card (top bar + step + footer) for a single
 * step index. Shared by the live flow (OnboardingFlow) and the screen-audit
 * gallery so both render identical chrome.
 */
export function OnboardingCardBody({
  index,
  direction,
  onNext,
  onBack,
  onFinish,
  onSkip,
}: OnboardingCardHandlers & {
  index: number;
  direction: "forward" | "back";
}) {
  const step = ONBOARDING_STEPS[index];
  const isFirst = index === 0;
  const isLast = index === ONBOARDING_STEPS.length - 1;
  const StepComponent = step.component;
  const stepKey = step.id;
  const animationClass =
    direction === "forward"
      ? "animate-step-enter-forward"
      : "animate-step-enter-back";

  return (
    <>
      {!isLast && (
        <div
          className="relative z-20 flex min-h-11 items-center px-4 pt-2 animate-onboarding-fade-in [animation-delay:200ms]"
          style={DRAG_REGION}
        >
          <div style={NO_DRAG_REGION}>
            <LocaleSwitcher variant="standalone" />
          </div>
          <div className="flex-1" />
        </div>
      )}

      <OnboardingStepContainer animationClass={animationClass} stepKey={stepKey}>
        <StepComponent
          onNext={onNext}
          onBack={onBack}
          onFinish={onFinish}
          onSkip={onSkip}
          isFirst={isFirst}
          isLast={isLast}
        />
      </OnboardingStepContainer>

      {!isLast && !isFirst && (
        <div className="relative z-20 flex min-h-[56px] items-center justify-between border-t border-[var(--ob-border)] px-6 py-3 animate-onboarding-fade-in [animation-delay:400ms]">
          <div className="min-w-[120px]">
            <Button
              variant="ghost"
              size="sm"
              className="rounded-lg text-[var(--ob-muted)] hover:bg-black/[0.04] hover:text-[var(--ob-fg)]"
              onClick={onBack}
            >
              <ArrowLeft className="h-4 w-4" />
              <Trans>Back</Trans>
            </Button>
          </div>

          <OnboardingProgress total={ONBOARDING_STEPS.length} current={index} />

          <div className="flex min-w-[120px] items-center justify-end">
            <Button
              size="sm"
              className={cn(
                "rounded-lg bg-[var(--ob-accent)] text-white hover:bg-[var(--ob-accent-strong)]",
              )}
              onClick={onNext}
            >
              <Trans>Continue</Trans>
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
