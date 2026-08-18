import type { ReactNode } from "react"
import { useNavigate } from "@tanstack/react-router"
import { Trans } from "@lingui/react/macro"
import {
  AudioLines,
  BookOpenText,
  Languages,
  Hand,
  Image as ImageIcon,
  HelpCircle,
  BookOpen,
  List,
  ShieldCheck,
  ArrowUpRight,
  type LucideIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"

interface Marquee {
  icon: LucideIcon
  tint: string
  title: ReactNode
  blurb: ReactNode
}

const MARQUEE: Marquee[] = [
  { icon: AudioLines, tint: "bg-stage-speech/10 text-stage-speech", title: <Trans>Audio narration</Trans>, blurb: <Trans>Natural text-to-speech, timed page by page.</Trans> },
  { icon: BookOpenText, tint: "bg-stage-easy-read/10 text-stage-easy-read", title: <Trans>Easy-read</Trans>, blurb: <Trans>Simplified text for lower reading levels.</Trans> },
  { icon: Languages, tint: "bg-stage-translate/10 text-stage-translate", title: <Trans>Translations</Trans>, blurb: <Trans>The same edition in every language you need.</Trans> },
  { icon: Hand, tint: "bg-stage-sign/10 text-stage-sign", title: <Trans>Sign language</Trans>, blurb: <Trans>Sign-language video linked to each page.</Trans> },
]

const SUPPORTING: { icon: LucideIcon; label: ReactNode }[] = [
  { icon: ImageIcon, label: <Trans>Image captions</Trans> },
  { icon: HelpCircle, label: <Trans>Quizzes</Trans> },
  { icon: BookOpen, label: <Trans>Glossary</Trans> },
  { icon: List, label: <Trans>Table of contents</Trans> },
  { icon: ShieldCheck, label: <Trans>WCAG validated</Trans> },
]

/** Home first-run bottom row: highlights the accessibility features every edition gains. */
export function FeatureShowcase() {
  const navigate = useNavigate()
  return (
    <>
      <div className="mb-4 mt-[26px] flex items-baseline">
        <div>
          <div className="text-[15px] font-bold">
            <Trans>Every edition, fully accessible</Trans>
          </div>
          <div className="mt-0.5 text-[12.5px] text-muted-foreground">
            <Trans>One book, every way to read, listen, and understand.</Trans>
          </div>
        </div>
        <button
          type="button"
          onClick={() => navigate({ to: "/onboarding" })}
          className="ml-auto inline-flex items-center gap-1.5 text-[12.5px] font-medium text-brand-700 hover:underline"
        >
          <Trans>Read the docs</Trans>
          <ArrowUpRight className="size-3" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        {MARQUEE.map((f, i) => {
          const Icon = f.icon
          return (
            <div
              key={i}
              className="rounded-2xl border bg-card p-4 transition-[transform,box-shadow] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className={cn("mb-3 grid size-10 place-items-center rounded-xl", f.tint)}>
                <Icon className="size-[21px]" />
              </div>
              <div className="text-sm font-semibold">{f.title}</div>
              <div className="mt-1 text-[11.5px] leading-relaxed text-muted-foreground">{f.blurb}</div>
            </div>
          )
        })}
      </div>

      <div className="mt-3.5 flex flex-wrap items-center gap-2">
        {SUPPORTING.map((s, i) => {
          const Icon = s.icon
          return (
            <span
              key={i}
              className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-[12px] font-medium text-foreground/80"
            >
              <Icon className="size-3.5 text-muted-foreground" />
              {s.label}
            </span>
          )
        })}
      </div>
    </>
  )
}
