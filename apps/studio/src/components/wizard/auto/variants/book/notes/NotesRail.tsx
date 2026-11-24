import { Trans } from "@lingui/react/macro"
import { Info } from "lucide-react"
import type { SetupBookFactId, SetupRecommendation } from "@adt/types"
import { cn } from "@/lib/utils"
import type { FactAnswers } from "../../../engine/answers"
import type { Finding } from "../model"
import { Note } from "./Note"

/** The one-reading warning: nothing was double-checked, so nothing could be asked. */
export function OneReading() {
  return (
    <p className="flex items-start gap-2 rounded-2xl bg-muted/80 px-3.5 py-2.5 text-[12.5px] leading-snug text-muted-foreground ring-1 ring-border">
      <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" />
      <Trans>Only one of the two AI readings finished, so nothing was double-checked. Give the notes a quick look; each can be corrected.</Trans>
    </p>
  )
}

/** The notes in the book's margin, numbered as their flags on the pages. */
export function NotesRail({
  rec,
  notes,
  answers,
  answered,
  active,
  flat,
  onActivate,
  onAnswer,
  onShowPage,
  className,
}: {
  rec: SetupRecommendation
  notes: Finding[]
  answers: FactAnswers
  answered: Set<SetupBookFactId>
  active: string | null
  flat?: boolean
  onActivate: (key: string) => void
  onAnswer: (fact: SetupBookFactId, value: string) => void
  onShowPage: (page: number) => void
  className?: string
}) {
  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {!rec.secondOpinion && <OneReading />}
      <ol className="flex flex-col gap-4">
        {notes.map((finding, i) => (
          <li key={finding.key} id={`note-card-${finding.key}`} className="scroll-mt-24 animate-[am-pop_0.4s_cubic-bezier(0.34,1.56,0.64,1)_both] motion-reduce:animate-none" style={{ animationDelay: `${i * 90}ms` }}>
            <Note
              finding={finding}
              number={i + 1}
              rec={rec}
              answers={answers}
              answered={finding.key !== "text" && finding.key !== "pages" && answered.has(finding.key)}
              active={active === finding.key}
              flat={flat}
              onActivate={() => onActivate(finding.key)}
              onAnswer={onAnswer}
              onShowPage={onShowPage}
            />
          </li>
        ))}
      </ol>
    </div>
  )
}
