import { LuminousContent } from "./LuminousContent"
import type { OnboardingStepProps } from "../../steps"

/** A2 — centered Luminous over a soft flowing mesh-gradient wash (painterly). */
export function FinaleMesh({ onSkip }: OnboardingStepProps) {
  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-[#fbfcff] px-14">
      <div
        aria-hidden
        className="animate-finale-aurora pointer-events-none absolute -inset-[22%] blur-2xl"
        style={{
          background:
            "radial-gradient(38% 42% at 18% 22%, rgba(59,130,247,0.22), transparent 70%), radial-gradient(36% 40% at 82% 16%, rgba(219,39,119,0.16), transparent 70%), radial-gradient(42% 46% at 74% 82%, rgba(101,163,13,0.16), transparent 70%), radial-gradient(40% 44% at 22% 84%, rgba(234,88,12,0.14), transparent 70%), radial-gradient(34% 38% at 50% 50%, rgba(79,70,229,0.12), transparent 70%)",
        }}
      />
      <div
        aria-hidden
        className="animate-finale-aurora pointer-events-none absolute -inset-[22%] blur-2xl [animation-delay:-10s]"
        style={{
          background:
            "radial-gradient(40% 44% at 70% 30%, rgba(34,163,255,0.14), transparent 70%), radial-gradient(38% 42% at 30% 60%, rgba(101,163,13,0.12), transparent 70%)",
        }}
      />
      <LuminousContent align="center" onSkip={onSkip} />
    </div>
  )
}
