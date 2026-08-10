import type { ComponentType } from "react";
import { WelcomeScene } from "./scenes/WelcomeScene";
import { BetaScene } from "./scenes/BetaScene";
import { SpeechScene } from "./scenes/features/SpeechScene";
import { TranslationsScene } from "./scenes/features/TranslationsScene";
import { QuizzesScene } from "./scenes/features/QuizzesScene";
import { GlossaryScene } from "./scenes/features/GlossaryScene";
import { ProviderSceneColor } from "./scenes/ProviderSceneColor";
import { FinaleSpotlight } from "./scenes/finale/FinaleSpotlight";
import { OB_IS_BETA } from "./theme";

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
    | "beta"
    | "speech"
    | "translations"
    | "quizzes"
    | "glossary"
    | "provider"
    | "finale";
  component: ComponentType<OnboardingStepProps>;
};

// The "how the beta works" step only appears on beta builds; stable ships the
// standard flow. Channel is resolved in ./theme.
export const ONBOARDING_STEPS: readonly OnboardingStep[] = [
  { id: "welcome", component: WelcomeScene },
  ...(OB_IS_BETA ? [{ id: "beta", component: BetaScene } as const] : []),
  { id: "speech", component: SpeechScene },
  { id: "translations", component: TranslationsScene },
  { id: "quizzes", component: QuizzesScene },
  { id: "glossary", component: GlossaryScene },
  { id: "provider", component: ProviderSceneColor },
  { id: "finale", component: FinaleSpotlight },
];
