import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { OnboardingLayout } from "./OnboardingLayout";
import { OnboardingCardBody } from "./OnboardingCardBody";
import { ONBOARDING_STEPS } from "./steps";
import {
  finishOnboardingViaBridge,
  markOnboardingCompleted,
} from "@/hooks/use-onboarding";

export function OnboardingFlow() {
  const navigate = useNavigate();
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState<"forward" | "back">("forward");

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

  const isLast = index === ONBOARDING_STEPS.length - 1;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter") return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return;
      if (isLast) onSkip();
      else onNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isLast, onSkip, onNext]);

  return (
    <OnboardingLayout>
      <OnboardingCardBody
        index={index}
        direction={direction}
        onNext={onNext}
        onBack={onBack}
        onFinish={onFinish}
        onSkip={onSkip}
      />
    </OnboardingLayout>
  );
}
