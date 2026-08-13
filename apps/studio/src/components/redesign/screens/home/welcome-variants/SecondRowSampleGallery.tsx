import type { ReactNode } from "react"
import { useNavigate } from "@tanstack/react-router"
import { Trans } from "@lingui/react/macro"
import { Play, Image as ImageIcon, Languages, HelpCircle, FlaskConical, Globe2, Calculator, ArrowRight } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { SecondRowHeader } from "./SecondRowShell"

interface Sample {
  id: string
  icon: LucideIcon
  cover: string
  title: ReactNode
  meta: ReactNode
  includes: { icon: LucideIcon; cls: string }[]
}

const INCLUDES = [
  { icon: Play, cls: "text-stage-speech" },
  { icon: ImageIcon, cls: "text-stage-captions" },
  { icon: Languages, cls: "text-stage-translate" },
  { icon: HelpCircle, cls: "text-stage-quizzes" },
]

const SAMPLES: Sample[] = [
  {
    id: "science",
    icon: FlaskConical,
    cover: "from-stage-captions/25 to-stage-speech/20",
    title: <Trans>The Living Cell</Trans>,
    meta: <Trans>Grade 5 · Science</Trans>,
    includes: INCLUDES,
  },
  {
    id: "geography",
    icon: Globe2,
    cover: "from-stage-translate/25 to-stage-sectioning/20",
    title: <Trans>Our Shared Planet</Trans>,
    meta: <Trans>Grade 6 · Geography</Trans>,
    includes: INCLUDES,
  },
  {
    id: "math",
    icon: Calculator,
    cover: "from-stage-storyboard/25 to-stage-quizzes/20",
    title: <Trans>Fractions & Ratios</Trans>,
    meta: <Trans>Grade 4 · Mathematics</Trans>,
    includes: INCLUDES,
  },
]

export function SecondRowSampleGallery() {
  const navigate = useNavigate()
  return (
    <>
      <SecondRowHeader
        title={<Trans>Open a finished book and explore</Trans>}
        description={<Trans>Pick a sample to hear the narration, read the captions and try a quiz — then convert your own.</Trans>}
        aside={
          <button
            type="button"
            onClick={() => navigate({ to: "/books/new" })}
            className="inline-flex items-center gap-1 rounded-md text-[13px] font-semibold text-brand-600 transition-colors hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Trans>or add your own PDF</Trans>
            <ArrowRight className="size-3.5" />
          </button>
        }
      />

      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
        {SAMPLES.map((s) => {
          const Icon = s.icon
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => navigate({ to: "/books/new" })}
              className="group overflow-hidden rounded-2xl border bg-card text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div className={cn("relative grid h-24 place-items-center bg-gradient-to-br", s.cover)}>
                <Icon className="size-8 text-foreground/50 transition-transform duration-200 group-hover:scale-110" />
                <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full bg-card/90 px-2 py-0.5 text-[10px] font-semibold shadow-sm">
                  <Play className="size-2.5 text-stage-speech" />
                  <Trans>Ready</Trans>
                </span>
              </div>
              <div className="p-3.5">
                <div className="text-[13.5px] font-semibold leading-tight">{s.title}</div>
                <div className="mt-0.5 text-[11.5px] text-muted-foreground">{s.meta}</div>
                <div className="mt-2.5 flex items-center gap-2">
                  {s.includes.map((inc, i) => {
                    const IncIcon = inc.icon
                    return (
                      <span key={i} className="grid size-6 place-items-center rounded-md bg-muted">
                        <IncIcon className={cn("size-3.5", inc.cls)} />
                      </span>
                    )
                  })}
                  <span className="ml-auto inline-flex items-center gap-1 text-[11.5px] font-semibold text-brand-600 opacity-0 transition-opacity group-hover:opacity-100">
                    <Trans>Open</Trans>
                    <ArrowRight className="size-3.5" />
                  </span>
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </>
  )
}
