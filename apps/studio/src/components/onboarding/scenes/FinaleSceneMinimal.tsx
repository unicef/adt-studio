import { useEffect, useState } from "react"
import { AudioLines, Languages, HelpCircle, BookOpen, ArrowUp } from "lucide-react"
import { Trans } from "@lingui/react/macro"
import { cn } from "@/lib/utils"
import type { OnboardingStepProps } from "../steps"

const BADGES = [
  { key: "speech", Icon: AudioLines, hex: "#e11d48", tint: "#fff1f2", label: <Trans>Speech</Trans> },
  { key: "translate", Icon: Languages, hex: "#db2777", tint: "#fdf2f8", label: <Trans>Translations</Trans> },
  { key: "quizzes", Icon: HelpCircle, hex: "#ea580c", tint: "#fff7ed", label: <Trans>Quizzes</Trans> },
  { key: "glossary", Icon: BookOpen, hex: "#65a30d", tint: "#f7fee7", label: <Trans>Glossary</Trans> },
] as const

/** Finale — minimal, action-first: drop a PDF, with a reassuring feature strip. */
export function FinaleSceneMinimal({ onFinish, onSkip }: OnboardingStepProps) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(id)
  }, [])

  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden px-10 text-center">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-56 bg-[radial-gradient(60%_100%_at_50%_0%,rgba(59,130,247,0.12),transparent_70%)]"
      />
      <div
        className={cn(
          "text-[11px] font-semibold uppercase tracking-[0.16em] text-[#3b82f7] transition-all duration-500",
          mounted ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0",
        )}
      >
        <Trans>Ready</Trans>
      </div>
      <h2
        className={cn(
          "mt-3 text-[34px] font-semibold leading-[1.06] tracking-[-0.02em] text-[#0a0a0a] transition-all duration-[700ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
          mounted ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
        )}
        style={{ transitionDelay: "80ms" }}
      >
        <Trans>Your first book starts here.</Trans>
      </h2>
      <p
        className={cn(
          "mt-2.5 max-w-[430px] text-[15px] leading-relaxed text-[#737373] transition-all duration-[700ms]",
          mounted ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
        )}
        style={{ transitionDelay: "150ms" }}
      >
        <Trans>Drop in a PDF and we'll turn it into an accessible edition.</Trans>
      </p>

      <button
        type="button"
        onClick={onFinish}
        className={cn(
          "group mt-6 flex w-[440px] flex-col items-center gap-2.5 rounded-2xl border-[1.5px] border-dashed border-[#9cc0ff] bg-[#f5f9ff] px-6 py-8 transition-all duration-[700ms] ease-[cubic-bezier(0.22,1,0.36,1)] hover:border-[#3b82f7] hover:bg-[#eef5ff] cursor-pointer",
          mounted ? "translate-y-0 scale-100 opacity-100" : "translate-y-3 scale-[0.98] opacity-0",
        )}
        style={{ transitionDelay: "230ms" }}
      >
        <span className="grid h-12 w-12 place-items-center rounded-xl bg-[#3b82f7] shadow-[0_8px_18px_-4px_rgba(59,130,247,0.5)] transition-transform duration-200 group-hover:-translate-y-0.5">
          <ArrowUp className="h-5 w-5 text-white" strokeWidth={2.6} />
        </span>
        <span className="text-[15px] font-semibold text-[#0a0a0a]">
          <Trans>Drop a PDF here</Trans>
        </span>
        <span className="text-[12.5px] text-[#737373]">
          <Trans>or click to browse your files</Trans>
        </span>
      </button>

      <div
        className={cn(
          "mt-5 flex items-center gap-2 transition-all duration-[600ms]",
          mounted ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
        )}
        style={{ transitionDelay: "330ms" }}
      >
        <span className="text-[12px] font-medium text-[#9aa0aa]">
          <Trans>Every book gets</Trans>
        </span>
        {BADGES.map((b) => (
          <span
            key={b.key}
            className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11.5px] font-semibold"
            style={{ backgroundColor: b.tint, color: b.hex }}
          >
            <b.Icon className="h-3 w-3" strokeWidth={2.4} />
            {b.label}
          </span>
        ))}
      </div>

      <button
        type="button"
        onClick={onSkip}
        className={cn(
          "mt-5 text-[13px] font-medium text-[#9aa0aa] transition-all duration-500 hover:text-[#0a0a0a] cursor-pointer",
          mounted ? "opacity-100" : "opacity-0",
        )}
        style={{ transitionDelay: "430ms" }}
      >
        <Trans>Explore a sample instead</Trans>
      </button>
    </div>
  )
}
