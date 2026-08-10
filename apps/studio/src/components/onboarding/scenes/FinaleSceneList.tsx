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
import { AnimatedList } from "@/components/ui/magicui/animated-list"
import { AuroraText } from "@/components/ui/magicui/aurora-text"
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
    <figure className="flex w-full items-center gap-3 rounded-2xl border border-black/[0.05] bg-white/90 p-3 shadow-[0_10px_30px_-14px_rgba(20,32,80,0.35)] backdrop-blur">
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

/** Finale variant C4 — MagicUI AnimatedList: feature "notifications" stack in one-by-one. */
export function FinaleSceneList({ onFinish, onSkip }: OnboardingStepProps) {
  return (
    <div className="relative grid h-full w-full grid-cols-[1fr_340px] items-center overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_120%_at_50%_-10%,#eaf3ff_0%,#ffffff_55%,#eafbf1_100%)]" />
      <div
        aria-hidden
        className="animate-onboarding-drift-a pointer-events-none absolute -left-16 top-4 h-72 w-72 rounded-full bg-[#3b82f7]/20 blur-3xl"
      />
      <div
        aria-hidden
        className="animate-onboarding-drift-b pointer-events-none absolute -right-10 bottom-0 h-72 w-72 rounded-full bg-[#22a35f]/15 blur-3xl"
      />

      {/* left — welcome copy */}
      <div className="relative flex flex-col pl-12 pr-6">
        <span className="animate-onboarding-fade-up inline-flex w-fit items-center gap-1.5 rounded-full border border-black/[0.06] bg-white/70 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#3b82f7] shadow-sm backdrop-blur [animation-delay:60ms]">
          <Accessibility className="h-3.5 w-3.5" strokeWidth={2.4} />
          <Trans>Built for every reader</Trans>
        </span>

        <h2 className="animate-onboarding-fade-up mt-6 max-w-[420px] text-[44px] font-semibold leading-[1.05] tracking-[-0.03em] text-[#0a0a0a] [animation-delay:160ms]">
          <Trans>Reading, for</Trans>{" "}
          <AuroraText colors={["#3b82f7", "#0ea5e9", "#22a35f", "#3b82f7"]}>
            everyone.
          </AuroraText>
        </h2>

        <p className="animate-onboarding-fade-up mt-5 max-w-[380px] text-[15px] leading-relaxed text-[#525866] [animation-delay:300ms]">
          <Trans>
            Every learner deserves to read, listen, and understand. ADT Studio
            builds accessibility into every book — right from the first page.
          </Trans>
        </p>

        <div className="animate-onboarding-fade-up mt-8 flex flex-col items-start gap-3 [animation-delay:460ms]">
          <button
            type="button"
            onClick={onFinish}
            className="group inline-flex items-center gap-2.5 rounded-2xl bg-[#3b82f7] px-7 py-3.5 text-[15px] font-semibold text-white shadow-[0_14px_34px_-8px_rgba(59,130,247,0.55)] transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 cursor-pointer"
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
            className="text-[13px] font-medium text-[#9aa0aa] transition-colors hover:text-[#0a0a0a] cursor-pointer"
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
  )
}
