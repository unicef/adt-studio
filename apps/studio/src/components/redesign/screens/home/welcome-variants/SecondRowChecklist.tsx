import type { ReactNode } from "react"
import { useNavigate } from "@tanstack/react-router"
import { Trans } from "@lingui/react/macro"
import { Plus, Sparkles, Eye, Package } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface Step {
  icon: typeof Plus
  title: ReactNode
  desc: ReactNode
}

const STEPS: Step[] = [
  { icon: Plus, title: <Trans>Add a book</Trans>, desc: <Trans>Convert a PDF — the pipeline starts automatically.</Trans> },
  { icon: Sparkles, title: <Trans>Generate</Trans>, desc: <Trans>Captions, narration, translations and quizzes are produced — each inspectable.</Trans> },
  { icon: Eye, title: <Trans>Preview & validate</Trans>, desc: <Trans>Check the accessible edition and its WCAG results.</Trans> },
  { icon: Package, title: <Trans>Export & share</Trans>, desc: <Trans>Package the bundle and hand it off.</Trans> },
]

/** Second-row option — a getting-started checklist (activation-first). Step 1 is live at first run. */
export function SecondRowChecklist() {
  const navigate = useNavigate()
  return (
    <>
      <div className="mb-3 mt-[22px]">
        <div className="text-[15px] font-bold">
          <Trans>Your first accessible book</Trans>
        </div>
        <div className="mt-0.5 text-[12.5px] text-muted-foreground">
          <Trans>Four steps from a PDF to a finished, shareable edition.</Trans>
        </div>
      </div>

      <div className="rounded-2xl border bg-card p-2">
        {STEPS.map((s, i) => {
          const Icon = s.icon
          const active = i === 0
          return (
            <div key={i} className="flex items-center gap-3.5 rounded-xl p-3.5">
              <div className="relative flex flex-col items-center self-stretch">
                <span
                  className={cn(
                    "grid size-9 shrink-0 place-items-center rounded-full text-[13px] font-bold",
                    active ? "bg-brand-600 text-white" : "bg-muted text-muted-foreground",
                  )}
                >
                  {active ? <Icon className="size-4" /> : i + 1}
                </span>
                {i < STEPS.length - 1 && <span className="mt-1 w-px flex-1 bg-border" />}
              </div>
              <div className="flex-1">
                <div className={cn("text-sm font-semibold", !active && "text-foreground/80")}>{s.title}</div>
                <div className="text-[12px] leading-relaxed text-muted-foreground">{s.desc}</div>
              </div>
              {active && (
                <Button size="sm" className="shrink-0" onClick={() => navigate({ to: "/books/new" })}>
                  <Plus className="size-3.5" />
                  <Trans>Add your first book</Trans>
                </Button>
              )}
            </div>
          )
        })}
      </div>
    </>
  )
}
