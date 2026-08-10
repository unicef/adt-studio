import { LuminousContent } from "./LuminousContent"
import type { OnboardingStepProps } from "../../steps"

function Blob({ className, delay = 0 }: { className: string; delay?: number }) {
  return (
    <div
      aria-hidden
      className={`animate-finale-aurora pointer-events-none absolute rounded-full blur-3xl ${className}`}
      style={{ animationDelay: `${delay}s` }}
    />
  )
}

/** A1 — centered Luminous over a living, feature-colored aurora of soft blobs. */
export function FinaleAuroraLight({ onSkip }: OnboardingStepProps) {
  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-[#fbfcff] px-14">
      <div className="animate-finale-aurora-in pointer-events-none absolute inset-0">
        <Blob className="-left-24 -top-20 h-[22rem] w-[22rem] bg-[#3b82f7]/20" />
        <Blob className="right-[-12%] top-[-14%] h-80 w-80 bg-[#db2777]/14" delay={-6} />
        <Blob className="bottom-[-20%] left-[26%] h-[24rem] w-[24rem] bg-[#65a30d]/14" delay={-11} />
        <Blob className="bottom-[-14%] right-[2%] h-72 w-72 bg-[#ea580c]/12" delay={-3} />
        <Blob className="left-[8%] bottom-[6%] h-64 w-64 bg-[#e11d48]/10" delay={-8} />
      </div>
      <LuminousContent align="center" onSkip={onSkip} />
    </div>
  )
}
