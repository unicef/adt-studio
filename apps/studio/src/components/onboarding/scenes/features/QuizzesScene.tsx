import { Check } from "lucide-react"
import { Trans, useLingui } from "@lingui/react/macro"
import { cn } from "@/lib/utils"
import { FeatureScene } from "../FeatureScene"
import { DemoCursor } from "../shared/DemoCursor"
import { useDemoLoop } from "../shared/useDemoLoop"

function QuizzesDemo() {
  const { t } = useLingui()
  const phase = useDemoLoop(4, [1600, 850, 550, 2600])
  const atOpt = phase >= 1
  const answered = phase >= 2
  const clicking = phase === 2
  const cursor = atOpt ? { x: 44, y: 128 } : { x: 258, y: 258 }
  const options = [
    { label: t`Respiration`, correct: false },
    { label: t`Photosynthesis`, correct: true },
    { label: t`Condensation`, correct: false },
  ]
  return (
    <div className="relative h-[286px] w-[300px] rounded-2xl bg-[var(--ob-surface)] p-5 shadow-[0_18px_44px_-12px_rgba(6,20,60,0.45)]">
      <div className="text-[13px] font-bold leading-snug text-[var(--ob-fg)]">
        <Trans>Which process releases oxygen?</Trans>
      </div>
      <div className="mt-3.5 space-y-2">
        {options.map((o) => {
          const on = answered && o.correct
          return (
            <div
              key={o.label}
              className={cn(
                "flex items-center gap-2.5 rounded-[10px] px-3 py-2.5 transition-all duration-300",
                on ? "bg-[#fff7ed] ring-1 ring-[#ea580c]" : "bg-[var(--ob-row)]",
              )}
            >
              <span
                className={cn(
                  "grid h-4 w-4 shrink-0 place-items-center rounded-full border-[1.5px] transition-colors",
                  on ? "border-[#ea580c] bg-[#ea580c]" : "border-[var(--ob-border-strong)] bg-[var(--ob-surface)]",
                )}
              >
                {on && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
              </span>
              <span
                className={cn(
                  "text-[12.5px] transition-colors",
                  on ? "font-semibold text-[#9a3412]" : "font-medium text-[var(--ob-muted)]",
                )}
              >
                {o.label}
              </span>
            </div>
          )
        })}
      </div>
      <div
        className={cn(
          "absolute bottom-5 left-5 flex items-center gap-1 rounded-full bg-[#ea580c] px-2.5 py-1 transition-all duration-300",
          answered ? "opacity-100" : "opacity-0",
        )}
      >
        <Check className="h-3 w-3 text-white" strokeWidth={3} />
        <span className="text-[11px] font-semibold text-white">
          <Trans>Correct</Trans>
        </span>
      </div>
      <DemoCursor x={cursor.x} y={cursor.y} clicking={clicking} color="#ea580c" />
    </div>
  )
}

export function QuizzesScene() {
  return (
    <FeatureScene
      slug="quizzes"
      panelLabel={<Trans>Quiz</Trans>}
      eyebrow={<Trans>Interactive</Trans>}
      title={<Trans>Learn by doing.</Trans>}
      desc={
        <Trans>
          Auto-built quizzes and exercises readers can actually answer — with
          instant feedback, right inside the page.
        </Trans>
      }
      caption={<Trans>Quizzes that check themselves.</Trans>}
    >
      <QuizzesDemo />
    </FeatureScene>
  )
}
