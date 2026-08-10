import { useEffect, useState } from "react"
import {
  ArrowRight,
  AudioLines,
  Languages,
  HelpCircle,
  BookOpen,
  Check,
  Image as ImageIcon,
} from "lucide-react"
import { Trans } from "@lingui/react/macro"
import { cn } from "@/lib/utils"
import type { OnboardingStepProps } from "../steps"

const BADGES = [
  { key: "speech", Icon: AudioLines, hex: "#e11d48", tint: "#fff1f2", label: <Trans>Speech</Trans> },
  { key: "translate", Icon: Languages, hex: "#db2777", tint: "#fdf2f8", label: <Trans>Translations</Trans> },
  { key: "quizzes", Icon: HelpCircle, hex: "#ea580c", tint: "#fff7ed", label: <Trans>Quizzes</Trans> },
  { key: "glossary", Icon: BookOpen, hex: "#65a30d", tint: "#f7fee7", label: <Trans>Glossary</Trans> },
] as const

/** Finale — payoff: the finished accessible book with its features snapping on. */
export function FinaleScenePayoff({ onFinish, onSkip }: OnboardingStepProps) {
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
          "inline-flex items-center gap-1.5 rounded-full bg-[#e9f7ef] px-2.5 py-1 transition-all duration-500",
          mounted ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0",
        )}
      >
        <Check className="h-3 w-3 text-[#0f9d58]" strokeWidth={3} />
        <span className="text-[12px] font-semibold text-[#0f9d58]">
          <Trans>Provider connected</Trans>
        </span>
      </div>

      <h2
        className={cn(
          "mt-3 text-[32px] font-semibold leading-[1.08] tracking-[-0.02em] text-[#0a0a0a] transition-all duration-[700ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
          mounted ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
        )}
        style={{ transitionDelay: "80ms" }}
      >
        <Trans>Every book, fully accessible.</Trans>
      </h2>
      <p
        className={cn(
          "mt-2.5 max-w-[440px] text-[15px] leading-relaxed text-[#737373] transition-all duration-[700ms]",
          mounted ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
        )}
        style={{ transitionDelay: "160ms" }}
      >
        <Trans>
          Speech, translations, quizzes and a glossary — built into every book
          you make.
        </Trans>
      </p>

      {/* the finished accessible book */}
      <div
        className={cn(
          "mt-6 w-[320px] rounded-2xl border border-black/[0.08] bg-white p-4 text-left shadow-[0_24px_60px_-24px_rgba(20,32,80,0.35)] transition-all duration-[700ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
          mounted ? "translate-y-0 scale-100 opacity-100" : "translate-y-3 scale-[0.97] opacity-0",
        )}
        style={{ transitionDelay: "240ms" }}
      >
        <div className="mb-2.5 flex items-center justify-between">
          <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#9aa0aa]">
            <Trans>Chapter 3</Trans>
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-[#e9f7ef] px-2 py-0.5 text-[10px] font-semibold text-[#0f9d58]">
            <Check className="h-2.5 w-2.5" strokeWidth={3} />
            {/* eslint-disable-next-line lingui/no-unlocalized-strings -- accessibility standard acronym */}
            <span>WCAG</span>
          </span>
        </div>
        <div className="mb-2 h-3 w-2/3 rounded bg-[#0a0a0a]" />
        <div className="mb-1.5 h-1.5 w-[92%] rounded-full bg-[#eef0f4]" />
        <div className="mb-3 h-1.5 w-[80%] rounded-full bg-[#eef0f4]" />
        <div className="relative mb-3 grid h-16 place-items-center overflow-hidden rounded-lg bg-gradient-to-br from-[#dbeafe] to-[#e0e7ff]">
          <ImageIcon className="h-5 w-5 text-[#3b82f7]" />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {BADGES.map((b, i) => (
            <span
              key={b.key}
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)]",
                mounted ? "translate-y-0 scale-100 opacity-100" : "translate-y-1 scale-75 opacity-0",
              )}
              style={{ backgroundColor: b.tint, color: b.hex, transitionDelay: `${520 + i * 110}ms` }}
            >
              <b.Icon className="h-3 w-3" strokeWidth={2.4} />
              {b.label}
            </span>
          ))}
        </div>
      </div>

      <div
        className={cn(
          "mt-7 flex flex-col items-center gap-3 transition-all duration-[600ms]",
          mounted ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
        )}
        style={{ transitionDelay: "1000ms" }}
      >
        <button
          type="button"
          onClick={onFinish}
          className="group inline-flex items-center gap-2 rounded-xl bg-[#3b82f7] px-6 py-3 text-[15px] font-semibold text-white shadow-[0_10px_24px_-6px_rgba(59,130,247,0.5)] transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 cursor-pointer"
        >
          <Trans>Add your first book</Trans>
          <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" strokeWidth={2.4} />
        </button>
        <button
          type="button"
          onClick={onSkip}
          className="text-[13px] font-medium text-[#9aa0aa] transition-colors hover:text-[#0a0a0a] cursor-pointer"
        >
          <Trans>Explore a sample instead</Trans>
        </button>
      </div>
    </div>
  )
}
