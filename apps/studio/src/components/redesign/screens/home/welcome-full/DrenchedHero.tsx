import type { ReactNode } from "react"
import { Trans } from "@lingui/react/macro"
import { Plus, FolderInput, BookText, AudioLines, Image, Languages, HelpCircle, Hand, ShieldCheck } from "lucide-react"
import { cn } from "@/lib/utils"
import type { WelcomeVariantProps } from "./DropZoneLauncher"

type Chip = { icon: typeof AudioLines; dot: string; label: ReactNode }

const CHIPS: Chip[] = [
  { icon: AudioLines, dot: "bg-stage-speech", label: <Trans>Narration</Trans> },
  { icon: Image, dot: "bg-stage-captions", label: <Trans>Captions</Trans> },
  { icon: Languages, dot: "bg-stage-translate", label: <Trans>Translation</Trans> },
  { icon: HelpCircle, dot: "bg-stage-quizzes", label: <Trans>Quizzes</Trans> },
  { icon: Hand, dot: "bg-stage-sign", label: <Trans>Sign language</Trans> },
  { icon: ShieldCheck, dot: "bg-stage-validation", label: <Trans>WCAG</Trans> },
]

export function DrenchedHero({ onAddBook, onImport, onOpenDocs }: WelcomeVariantProps) {
  return (
    <div className="grid h-full place-items-center px-8 py-8 lg:px-12">
      <div
        className="relative w-full max-w-[880px] overflow-hidden rounded-[28px] px-9 py-11 text-white shadow-xl sm:px-12"
        style={{ background: "linear-gradient(152deg, oklch(0.56 0.17 260), oklch(0.43 0.16 264))" }}
      >
        <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 size-56 rounded-full bg-white/10 blur-2xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-20 left-10 size-64 rounded-full blur-3xl" style={{ background: "oklch(0.7 0.16 300 / 0.25)" }} />

        <div className="relative max-w-[46ch]">
          <div className="mb-4 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] backdrop-blur-sm">
            <Trans>New here</Trans>
          </div>
          <h1 className="text-[clamp(2rem,3.4vw,2.8rem)] font-bold leading-[1.05] tracking-[-0.025em]">
            <Trans>Add your first book.</Trans>
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-white/85">
            <Trans>Drop in a textbook PDF and ADT builds a fully accessible edition, narrated, captioned, translated, and quiz-ready, every step yours to inspect.</Trans>
          </p>

          <div className="mt-7 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onAddBook}
              className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-[13.5px] font-semibold text-[oklch(0.45_0.16_262)] shadow-sm transition-transform duration-200 hover:scale-[1.02] active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
            >
              <Plus className="size-4" />
              <Trans>Choose a PDF</Trans>
            </button>
            <button
              type="button"
              onClick={onImport}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/30 px-4 py-2.5 text-[13.5px] font-medium text-white transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
            >
              <FolderInput className="size-4" />
              <Trans>Import a project</Trans>
            </button>
            <button
              type="button"
              onClick={onOpenDocs}
              className="inline-flex items-center gap-1.5 px-2 py-2.5 text-[13.5px] font-medium text-white/85 underline decoration-white/40 underline-offset-4 transition-colors hover:text-white hover:decoration-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
            >
              <BookText className="size-4" />
              <Trans>Read the docs</Trans>
            </button>
          </div>
        </div>

        <div className="relative mt-9 flex flex-wrap gap-2">
          {CHIPS.map((c, i) => {
            const Icon = c.icon
            return (
              <span key={i} className="inline-flex items-center gap-2 rounded-full bg-white/12 px-3 py-1.5 text-[12px] font-medium backdrop-blur-sm">
                <span className={cn("grid size-4 place-items-center rounded-full text-white", c.dot)}>
                  <Icon className="size-2.5" />
                </span>
                {c.label}
              </span>
            )
          })}
        </div>
      </div>
    </div>
  )
}
