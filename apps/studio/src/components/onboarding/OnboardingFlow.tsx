import { useCallback, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Trans } from "@lingui/react/macro";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { OnboardingLayout, OnboardingStepContainer } from "./OnboardingLayout";
import { OnboardingProgress } from "./OnboardingProgress";
import { ONBOARDING_STEPS } from "./steps";
import {
  finishOnboardingViaBridge,
  markOnboardingCompleted,
} from "@/hooks/use-onboarding";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DRAG_REGION, NO_DRAG_REGION } from "@/constants";

export function OnboardingFlow() {
  const navigate = useNavigate();
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState<"forward" | "back">("forward");

  const step = ONBOARDING_STEPS[index];
  const isFirst = index === 0;
  const isLast = index === ONBOARDING_STEPS.length - 1;

  const onNext = useCallback(() => {
    setDirection("forward");
    setIndex((i) => Math.min(i + 1, ONBOARDING_STEPS.length - 1));
  }, []);

  const onBack = useCallback(() => {
    setDirection("back");
    setIndex((i) => Math.max(i - 1, 0));
  }, []);

  const onFinish = useCallback(() => {
    if (finishOnboardingViaBridge("/books/new")) return;
    markOnboardingCompleted();
    navigate({ to: "/books/new" });
  }, [navigate]);

  const onSkip = useCallback(() => {
    if (finishOnboardingViaBridge("/")) return;
    markOnboardingCompleted();
    navigate({ to: "/" });
  }, [navigate]);

  const StepComponent = step.component;
  const animationClass =
    direction === "forward"
      ? "animate-step-enter-forward"
      : "animate-step-enter-back";

  return (
    <OnboardingLayout>
      <div
        className="relative z-20 flex min-h-10 items-center px-4 pt-2 animate-onboarding-fade-in [animation-delay:200ms]"
        style={DRAG_REGION}
      >
        <div style={NO_DRAG_REGION}>
          <LocaleSwitcher variant="standalone" />
        </div>
        <div className="flex-1" />
        {!isLast && (
          <button
            type="button"
            onClick={onSkip}
            style={NO_DRAG_REGION}
            className="rounded-lg px-3 py-1.5 text-xs font-medium text-zinc-500 transition-colors hover:text-zinc-200 cursor-pointer"
          >
            <Trans>Skip</Trans>
          </button>
        )}
      </div>

      <OnboardingStepContainer animationClass={animationClass} stepKey={step.id}>
        <StepComponent
          onNext={onNext}
          onBack={onBack}
          onFinish={onFinish}
          onSkip={onSkip}
          isFirst={isFirst}
          isLast={isLast}
        />
      </OnboardingStepContainer>

      <div className="relative z-20 flex min-h-[56px] items-center justify-between border-t border-white/[0.06] px-5 py-3 animate-onboarding-fade-in [animation-delay:400ms]">
        <div className="min-w-[120px]">
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "rounded-lg text-zinc-400 hover:bg-white/5 hover:text-zinc-100",
              isFirst && "invisible",
            )}
            onClick={onBack}
            disabled={isFirst}
          >
            <ArrowLeft className="h-4 w-4" />
            <Trans>Back</Trans>
          </Button>
        </div>

        <OnboardingProgress total={ONBOARDING_STEPS.length} current={index} />

        <div className="flex min-w-[120px] items-center justify-end gap-2">
          <Button
            size="sm"
            className={cn(
              "rounded-lg bg-white text-zinc-900 hover:bg-zinc-200",
              (isFirst || isLast) && "invisible",
            )}
            onClick={onNext}
          >
            <Trans>Continue</Trans>
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </OnboardingLayout>
  );
}
