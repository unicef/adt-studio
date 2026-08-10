import type { ComponentType } from "react";
import { WelcomeScene } from "./scenes/WelcomeScene";
import { SpeechScene } from "./scenes/features/SpeechScene";
import { TranslationsScene } from "./scenes/features/TranslationsScene";
import { QuizzesScene } from "./scenes/features/QuizzesScene";
import { GlossaryScene } from "./scenes/features/GlossaryScene";
import { ProviderScene } from "./scenes/ProviderScene";
import { FinaleSceneRecap } from "./scenes/FinaleSceneRecap";

export type OnboardingStepProps = {
  onNext: () => void;
  onBack: () => void;
  onFinish: () => void;
  onSkip: () => void;
  isFirst: boolean;
  isLast: boolean;
};

export type OnboardingStep = {
  id:
    | "welcome"
    | "speech"
    | "translations"
    | "quizzes"
    | "glossary"
    | "provider"
    | "finale";
  component: ComponentType<OnboardingStepProps>;
};

export const ONBOARDING_STEPS: readonly OnboardingStep[] = [
  { id: "welcome", component: WelcomeScene },
  { id: "speech", component: SpeechScene },
  { id: "translations", component: TranslationsScene },
  { id: "quizzes", component: QuizzesScene },
  { id: "glossary", component: GlossaryScene },
  { id: "provider", component: ProviderScene },
  { id: "finale", component: FinaleSceneRecap },
] as const;
