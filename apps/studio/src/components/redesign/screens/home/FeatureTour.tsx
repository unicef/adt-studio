import type { ReactNode } from "react"
import { useNavigate } from "@tanstack/react-router"
import { Trans } from "@lingui/react/macro"
import { FileText, Scissors, LayoutGrid, SquareCheckBig, ArrowUpRight } from "lucide-react"

interface Feature {
  id: string
  icon: ReactNode
  tile: string
  title: ReactNode
  body: ReactNode
}

const FEATURES: Feature[] = [
  {
    id: "extract",
    icon: <FileText className="size-[18px]" />,
    tile: "bg-brand-100 text-brand-600",
    title: <Trans>Extract & filter</Trans>,
    body: <Trans>Pull text, images, and structure from any PDF — automatically deduped and cleaned.</Trans>,
  },
  {
    id: "sectioning",
    icon: <Scissors className="size-[18px]" />,
    tile: "bg-stage-captions/10 text-stage-captions",
    title: <Trans>Sectioning</Trans>,
    body: <Trans>Detect chapters, headings, and learning units so each section is processed on its own.</Trans>,
  },
  {
    id: "storyboards",
    icon: <LayoutGrid className="size-[18px]" />,
    tile: "bg-stage-storyboard/10 text-stage-storyboard",
    title: <Trans>Storyboards & captions</Trans>,
    body: <Trans>Generate accessible image captions and learning storyboards with AI you can inspect.</Trans>,
  },
  {
    id: "quizzes",
    icon: <SquareCheckBig className="size-[18px]" />,
    tile: "bg-stage-toc/10 text-stage-toc",
    title: <Trans>Quizzes & glossary</Trans>,
    body: <Trans>Auto-build assessments and key term lists, then export everything as a shareable bundle.</Trans>,
  },
]

/** Home first-run "What ADT Studio does" tour (design 1c). */
export function FeatureTour() {
  const navigate = useNavigate()
  return (
    <>
      <div className="mb-3 mt-[22px] flex items-baseline">
        <div>
          <div className="text-[15px] font-bold">
            <Trans>What ADT Studio does</Trans>
          </div>
          <div className="mt-0.5 text-[12.5px] text-muted-foreground">
            <Trans>Each stage runs in your library — fully transparent, easy to rerun.</Trans>
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
      <div className="grid grid-cols-4 gap-3.5">
        {FEATURES.map((f) => (
          <div key={f.id} className="rounded-2xl border bg-card p-4">
            <div className={`mb-[11px] grid size-[34px] place-items-center rounded-[10px] ${f.tile}`}>{f.icon}</div>
            <div className="mb-[5px] text-[13.5px] font-semibold">{f.title}</div>
            <div className="text-[11.5px] leading-relaxed text-muted-foreground">{f.body}</div>
          </div>
        ))}
      </div>
    </>
  )
}
