import type { ReactNode } from "react"
import { useNavigate } from "@tanstack/react-router"
import { Trans } from "@lingui/react/macro"
import {
  Volume2,
  BookOpenText,
  Languages,
  Hand,
  Captions,
  HelpCircle,
  BookOpen,
  List,
  ShieldCheck,
  ArrowUpRight,
  type LucideIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"

/** Reader-facing modes a book can be experienced in, shown as the hero. */
const MODES: { icon: LucideIcon; tint: string; label: ReactNode }[] = [
  { icon: Volume2, tint: "bg-stage-speech text-white", label: <Trans>Listen</Trans> },
  { icon: BookOpenText, tint: "bg-stage-easy-read text-white", label: <Trans>Easy-read</Trans> },
  { icon: Languages, tint: "bg-stage-translate text-white", label: <Trans>Translate</Trans> },
  { icon: Hand, tint: "bg-stage-sign text-white", label: <Trans>Sign</Trans> },
  { icon: Captions, tint: "bg-stage-captions text-white", label: <Trans>Captions</Trans> },
]

const EXTRAS: { icon: LucideIcon; tint: string; title: ReactNode; blurb: ReactNode }[] = [
  { icon: HelpCircle, tint: "bg-stage-quizzes/10 text-stage-quizzes", title: <Trans>Quizzes</Trans>, blurb: <Trans>Comprehension checks per section.</Trans> },
  { icon: BookOpen, tint: "bg-stage-glossary/10 text-stage-glossary", title: <Trans>Glossary</Trans>, blurb: <Trans>Key terms, defined in place.</Trans> },
  { icon: List, tint: "bg-stage-toc/10 text-stage-toc", title: <Trans>Contents</Trans>, blurb: <Trans>Navigable, auto-generated.</Trans> },
  { icon: ShieldCheck, tint: "bg-stage-validation/10 text-stage-validation", title: <Trans>WCAG validated</Trans>, blurb: <Trans>Checked before every export.</Trans> },
]

/** Home first-run bottom row: a bento highlighting the reader-facing accessibility modes. */
export function FeatureBento() {
  const navigate = useNavigate()
  return (
    <>
      <div className="mb-4 mt-[26px] flex items-baseline">
        <div>
          <div className="text-[15px] font-bold">
            <Trans>Every edition, fully accessible</Trans>
          </div>
          <div className="mt-0.5 text-[12.5px] text-muted-foreground">
            <Trans>Readers choose how they take in each page — you generate it once.</Trans>
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

      <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-3">
        <div className="relative overflow-hidden rounded-2xl border bg-card p-5 lg:col-span-2">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-16 -top-16 size-52 rounded-full opacity-[0.14] blur-2xl"
            style={{ background: "radial-gradient(circle, var(--brand-500) 0%, transparent 70%)" }}
          />
          <div className="text-[13px] font-semibold text-muted-foreground">
            <Trans>Read it your way</Trans>
          </div>
          <p className="mt-1.5 max-w-[40ch] text-[13px] leading-relaxed text-foreground/80">
            <Trans>Every page can be listened to, simplified, translated, signed, or captioned — switchable as the reader goes.</Trans>
          </p>
          <div className="mt-5 flex flex-wrap gap-2.5">
            {MODES.map((m, i) => {
              const Icon = m.icon
              return (
                <span
                  key={i}
                  className="inline-flex items-center gap-2 rounded-full border bg-background py-1.5 pl-1.5 pr-3.5 text-[12.5px] font-semibold shadow-sm"
                >
                  <span className={cn("grid size-6 place-items-center rounded-full", m.tint)}>
                    <Icon className="size-3.5" />
                  </span>
                  {m.label}
                </span>
              )
            })}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3.5">
          {EXTRAS.map((e, i) => {
            const Icon = e.icon
            return (
              <div key={i} className="rounded-2xl border bg-card p-3.5">
                <div className={cn("mb-2 grid size-8 place-items-center rounded-lg", e.tint)}>
                  <Icon className="size-[17px]" />
                </div>
                <div className="text-[13px] font-semibold">{e.title}</div>
                <div className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{e.blurb}</div>
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}
