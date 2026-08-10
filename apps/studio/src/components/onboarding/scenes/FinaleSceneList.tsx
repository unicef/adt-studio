import { useEffect, useState } from "react"
import {
  ArrowRight,
  AudioLines,
  Languages,
  HelpCircle,
  BookOpen,
  Accessibility,
  type LucideIcon,
} from "lucide-react"
import { Trans } from "@lingui/react/macro"
import { cn } from "@/lib/utils"
import { AnimatedList } from "@/components/ui/magicui/animated-list"
import { AppPreview } from "../AppPreview"
import type { OnboardingStepProps } from "../steps"

/* eslint-disable lingui/no-unlocalized-strings -- design-variant sample copy, not shipped UI */
type Feed = {
  icon: LucideIcon
  title: string
  desc: string
  hex: string
  tint: string
}

// Reader-facing features, using the exact pipeline stage icons + hexes (stage-config.ts).
const FEED: Feed[] = [
  { icon: AudioLines, title: "Narration ready", desc: "Every page, read aloud", hex: "#e11d48", tint: "#fff1f2" },
  { icon: Languages, title: "Translated", desc: "Now readable in 5 languages", hex: "#db2777", tint: "#fdf2f8" },
  { icon: HelpCircle, title: "Quizzes added", desc: "Check understanding as they go", hex: "#ea580c", tint: "#fff7ed" },
  { icon: BookOpen, title: "Glossary built", desc: "Hard words, one tap away", hex: "#65a30d", tint: "#f7fee7" },
  { icon: Accessibility, title: "Accessible for everyone", desc: "WCAG-ready, from the first page", hex: "#3b82f7", tint: "#eff6ff" },
]
/* eslint-enable lingui/no-unlocalized-strings */

function Notification({ icon: Icon, title, desc, hex, tint }: Feed) {
  return (
    <figure className="flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/95 p-3 shadow-[0_16px_40px_-16px_rgba(0,0,0,0.6)] backdrop-blur">
      <span
        className="grid h-11 w-11 shrink-0 place-items-center rounded-xl"
        style={{ backgroundColor: tint }}
      >
        <Icon className="h-[22px] w-[22px]" style={{ color: hex }} strokeWidth={2.2} />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="text-[14px] font-semibold text-[#0a0a0a]">{title}</span>
        <span className="truncate text-[12.5px] text-[#737373]">{desc}</span>
      </span>
    </figure>
  )
}

/** Finale variant C4 — MagicUI AnimatedList over the cinematic app-rising background. */
export function FinaleSceneList({ onFinish, onSkip }: OnboardingStepProps) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(id)
  }, [])

  return (
    <div className="relative h-full w-full overflow-hidden">
      {/* real app rising behind a dark vignette (shared with the cinematic finale) */}
      <div
        className={cn(
          "absolute inset-x-0 top-8 mx-auto w-[112%] max-w-none -translate-x-[6%] transition-all duration-[1100ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
          mounted ? "scale-100 opacity-100" : "scale-[1.06] opacity-0",
        )}
      >
        <AppPreview />
      </div>
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, rgba(9,14,34,0.55) 0%, rgba(8,12,30,0.72) 45%, rgba(5,9,26,0.94) 100%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(90deg, rgba(5,9,26,0.86) 0%, rgba(5,9,26,0.6) 38%, rgba(5,9,26,0) 62%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute left-[28%] top-[44%] h-72 w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ background: "radial-gradient(closest-side, rgba(59,130,247,0.4), transparent)" }}
      />

      <div
        className={cn(
          "absolute inset-0 grid grid-cols-[1fr_340px] items-center transition-all duration-[800ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
          mounted ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0",
        )}
        style={{ transitionDelay: "250ms" }}
      >
        {/* left — welcome copy */}
        <div className="relative flex flex-col pl-12 pr-6">
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#b3c6ff] backdrop-blur">
            <Accessibility className="h-3.5 w-3.5" strokeWidth={2.4} />
            <Trans>Built for every reader</Trans>
          </span>

          <h2 className="mt-6 max-w-[420px] text-[44px] font-semibold leading-[1.05] tracking-[-0.03em] text-white">
            <Trans>Reading, for</Trans> <span className="text-[#8ab4ff]"><Trans>everyone.</Trans></span>
          </h2>

          <p className="mt-5 max-w-[380px] text-[15px] leading-relaxed text-[#d3d9e8]">
            <Trans>
              Every learner deserves to read, listen, and understand. ADT Studio
              builds accessibility into every book — right from the first page.
            </Trans>
          </p>

          <div className="mt-8 flex flex-col items-start gap-3">
            <button
              type="button"
              onClick={onFinish}
              className="group inline-flex items-center gap-2.5 rounded-2xl bg-white px-7 py-3.5 text-[15px] font-semibold text-[#0f1729] shadow-[0_16px_40px_-8px_rgba(40,90,220,0.6)] transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 cursor-pointer"
            >
              <Trans>Add your first book</Trans>
              <ArrowRight
                className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5"
                strokeWidth={2.4}
              />
            </button>
            <button
              type="button"
              onClick={onSkip}
              className="text-[13px] font-medium text-[#9fa8bf] transition-colors hover:text-white cursor-pointer"
            >
              <Trans>Explore a sample instead</Trans>
            </button>
          </div>
        </div>

        {/* right — animated feature feed */}
        <div className="relative flex h-full items-center pr-10">
          <div className="relative w-full [mask-image:linear-gradient(to_bottom,transparent,black_18%,black_82%,transparent)]">
            <AnimatedList delay={900} className="gap-3">
              {FEED.map((f) => (
                <Notification key={f.title} {...f} />
              ))}
            </AnimatedList>
          </div>
        </div>
      </div>
    </div>
  )
}
