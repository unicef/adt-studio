import { useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { Check, ChevronDown } from "lucide-react"
import type { SetupBookFactId, SetupRecommendation } from "@adt/types"
import { FACT_SHORT } from "../../engine/words"
import { ClaimMark } from "./shared/ideas/evidence/ClaimMark"
import { QuestionCard } from "./shared/Question"
import type { Answers } from "./shared/useAnswers"
import { QUESTION_SHORT } from "./shared/words"
import { Morph } from "./Morph"

/**
 * The questions the engine needs answered, one at a time. Answering ticks it (a one-line row with
 * the answer) and the next one takes its place; a ticked row opens again to change the answer.
 */
export function Questions({ rec, chat, file, frozen, onAnswer }: { rec: SetupRecommendation; chat: Answers; file: File | null | undefined; frozen: boolean; onAnswer: (fact: SetupBookFactId, value: string) => void }) {
  const { i18n } = useLingui()
  const derived = chat.derived!
  const asked = derived.asked
  const [reopened, setReopened] = useState<SetupBookFactId | null>(null)
  const open = asked.find((f) => f.id === reopened) ?? derived.pending
  if (!asked.length) return null
  const index = open ? asked.indexOf(open) : -1
  const labelId = open ? `gd-q-${open.id}` : undefined
  return (
    <section className="flex flex-col gap-2">
      {asked.map((fact) => {
        const answer = chat.answers[fact.id]
        if (!answer || fact.id === open?.id) return null
        return (
          <button
            key={fact.id}
            type="button"
            disabled={frozen}
            onClick={() => setReopened(fact.id)}
            className="gd-tick group flex min-h-11 w-full items-center gap-3 rounded-[14px] px-3.5 text-left text-[14.5px] transition-colors hover:bg-[var(--lc-bubble)] disabled:pointer-events-none"
          >
            <span className="grid size-5 shrink-0 place-items-center rounded-full bg-[var(--gd-step)] text-primary-foreground">
              <Check className="size-3 stroke-[3]" />
            </span>
            <span className="min-w-0 flex-1 truncate text-muted-foreground">
              {i18n._(QUESTION_SHORT[fact.id]!)} <span className="font-medium text-foreground">{i18n._(FACT_SHORT[fact.id][answer]!)}</span>
            </span>
            {!frozen && (
              <span className="inline-flex shrink-0 items-center gap-1 text-[13.5px] font-medium text-brand-700 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                <Trans>Change</Trans>
                <ChevronDown className="size-3.5" />
              </span>
            )}
          </button>
        )
      })}
      {open && (
        <Morph swap={open.id} className="-m-2" inner="flex flex-col gap-2.5 p-2">
          <div className="flex items-baseline justify-between gap-4 px-1 pt-1">
            <h2 id={labelId} className="text-[17px] font-semibold leading-snug tracking-[-0.01em]">
              {i18n._(QUESTION_SHORT[open.id]!)}
              <ClaimMark file={file} pages={open.evidencePages} />
            </h2>
            {asked.length > 1 && (
              <span className="shrink-0 text-[13px] tabular-nums text-muted-foreground">
                <Trans>
                  {index + 1} of {asked.length}
                </Trans>
              </span>
            )}
          </div>
          <QuestionCard
            rec={rec}
            fact={open}
            answers={derived.current}
            chosen={chat.answers[open.id]}
            onAnswer={(v) => {
              setReopened(null)
              onAnswer(open.id, v)
            }}
            frozen={frozen}
            file={file}
            labelId={labelId!}
          />
        </Morph>
      )}
    </section>
  )
}
