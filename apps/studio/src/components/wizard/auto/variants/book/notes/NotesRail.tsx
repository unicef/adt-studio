import { Trans } from "@lingui/react/macro"
import { Info } from "lucide-react"
import type { SetupBookFactId, SetupRecommendation } from "@adt/types"
import { cn } from "@/lib/utils"
import type { FactAnswers } from "../../../engine/answers"
import type { Finding } from "../model"
import { Note } from "./Note"

/** Blank notes while the AI reads: the margin is ready, the words aren't in yet. */
export function WaitingNotes({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <p className="sr-only">
        <Trans>The notes appear here when the AI has read the book.</Trans>
      </p>
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          aria-hidden
          className={cn("relative rounded-[4px] bg-[#fff6c9]/70 px-4 pb-4 pt-5 shadow-[0_12px_24px_-18px_rgba(60,45,0,0.6)] animate-[am-fade-up_0.5s_cubic-bezier(0.22,1,0.36,1)_both] motion-reduce:animate-none dark:bg-[#2e2a1b]/70", i % 2 ? "rotate-[0.5deg]" : "-rotate-[0.6deg]")}
          style={{ animationDelay: `${200 + i * 160}ms` }}
        >
          <span className="absolute -top-2 left-1/2 h-4 w-16 -translate-x-1/2 -rotate-2 rounded-[2px] bg-white/50 dark:bg-white/10" />
          <span className="block h-2 w-20 rounded-full bg-stone-900/10 motion-safe:animate-pulse dark:bg-white/10" />
          <span className="mt-2.5 block h-3 w-[80%] rounded-full bg-stone-900/10 motion-safe:animate-pulse dark:bg-white/10" />
          {i === 0 && <span className="mt-2 block h-3 w-[55%] rounded-full bg-stone-900/10 motion-safe:animate-pulse dark:bg-white/10" />}
        </div>
      ))}
    </div>
  )
}

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
