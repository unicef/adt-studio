import { useEffect, useState } from "react"
import { AudioLines, Languages, HelpCircle, BookOpen, CornerDownLeft } from "lucide-react"
import { Trans } from "@lingui/react/macro"
import { cn } from "@/lib/utils"
import { AppPreview } from "../AppPreview"
import type { OnboardingStepProps } from "../steps"

const PILLS = [
  { key: "speech", Icon: AudioLines, hex: "#e11d48", tint: "#fff1f2", label: <Trans>Speech</Trans> },
  { key: "translate", Icon: Languages, hex: "#db2777", tint: "#fdf2f8", label: <Trans>Translations</Trans> },
  { key: "quizzes", Icon: HelpCircle, hex: "#ea580c", tint: "#fff7ed", label: <Trans>Quizzes</Trans> },
  { key: "glossary", Icon: BookOpen, hex: "#65a30d", tint: "#f7fee7", label: <Trans>Glossary</Trans> },
] as const

/** Logo lands centered, rises to the top, then the welcome + app preview reveal. */
export function WelcomeScene({ onNext }: OnboardingStepProps) {
  const [mounted, setMounted] = useState(false)
  const [revealed, setRevealed] = useState(false)

  useEffect(() => {
    const raf = requestAnimationFrame(() => setMounted(true))
    const timer = setTimeout(() => setRevealed(true), 1050)
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(timer)
    }
  }, [])

  return (
    <div className="relative flex h-full w-full flex-col items-center overflow-hidden px-10 pt-11 text-center">
      <img
        aria-hidden
        src="/logo.png"
        alt=""
        width={54}
        height={54}
        className={cn(
          "z-10 rounded-[14px] transition-all duration-[900ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
          !mounted && "scale-[0.6] opacity-0",
          mounted && !revealed && "translate-y-[188px] scale-[2] opacity-100",
          revealed && "translate-y-0 scale-100 opacity-100",
        )}
        style={{ boxShadow: "0 16px 40px -12px rgba(59,130,247,.55)" }}
      />

      <h1
        className={cn(
          "mt-5 text-[32px] font-semibold leading-tight tracking-[-0.02em] text-[#0a0a0a] transition-all duration-[700ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
          revealed ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
        )}
        style={{ transitionDelay: revealed ? "100ms" : "0ms" }}
      >
        <Trans>Welcome to ADT Studio</Trans>
      </h1>

      <p
        className={cn(
          "mt-3 max-w-md text-[15px] leading-relaxed text-[#737373] transition-all duration-[700ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
          revealed ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
        )}
        style={{ transitionDelay: revealed ? "180ms" : "0ms" }}
      >
        <Trans>
          Turn any textbook into an accessible edition — every step of the
          pipeline, built in.
        </Trans>
      </p>

      <div
        className={cn(
          "mt-4 flex flex-wrap items-center justify-center gap-2 transition-all duration-[700ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
          revealed ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
        )}
        style={{ transitionDelay: revealed ? "260ms" : "0ms" }}
      >
        {PILLS.map((p) => (
          <span
            key={p.key}
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[13px] font-medium"
            style={{ backgroundColor: p.tint, color: p.hex }}
          >
            <p.Icon className="h-3.5 w-3.5" strokeWidth={2.4} />
            {p.label}
          </span>
        ))}
      </div>

      <div
        className={cn(
          "mt-6 transition-all duration-[600ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
          revealed ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
        )}
        style={{ transitionDelay: revealed ? "340ms" : "0ms" }}
      >
        <button
          type="button"
          autoFocus
          onClick={onNext}
          className="group inline-flex items-center gap-2 rounded-xl bg-[#3b82f7] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_8px_20px_-4px_rgba(59,130,247,0.45)] transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 cursor-pointer"
        >
          <Trans>Let's start</Trans>
          <CornerDownLeft className="h-4 w-4 text-white/80 transition-transform duration-200 group-hover:translate-x-0.5" />
        </button>
      </div>

      <div
        className={cn(
          "mt-auto w-full max-w-2xl px-2 transition-all duration-[900ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
          revealed ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0",
        )}
        style={{ transitionDelay: revealed ? "460ms" : "0ms" }}
      >
        <AppPreview />
      </div>
    </div>
  )
}
