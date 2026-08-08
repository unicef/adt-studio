import type { ComponentType } from "react";
import { WelcomeScene } from "./scenes/WelcomeScene";
import { ApiKeyStep } from "./scenes/ApiKeyScene";
import { FinaleScene } from "./scenes/FinaleScene";

export type OnboardingStepProps = {
  onNext: () => void;
  onBack: () => void;
  onFinish: () => void;
  onSkip: () => void;
  isFirst: boolean;
  isLast: boolean;
};

export type OnboardingStep = {
  id: "welcome" | "api-key" | "finale";
  component: ComponentType<OnboardingStepProps>;
};

export const ONBOARDING_STEPS: readonly OnboardingStep[] = [
  { id: "welcome", component: WelcomeScene },
  { id: "api-key", component: ApiKeyStep },
  { id: "finale", component: FinaleScene },
] as const;
