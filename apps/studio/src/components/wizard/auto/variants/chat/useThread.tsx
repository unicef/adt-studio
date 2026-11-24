/* eslint-disable lingui/no-unlocalized-strings -- message and step ids and CSS selectors, never shown */
import type { ReactNode } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { FileWarning } from "lucide-react"
import type { SetupBookFactId, SetupRecommendation, SetupSettingId } from "@adt/types"
import type { SetupFailure } from "../../recommendation/client"
import type { EngineRun } from "../../engine/useEngineRun"
import { FACT_SHORT } from "../../engine/words"
import type { UploadFlow } from "../../../start/upload/useUploadFlow"
import { useScopeSummary } from "../../../core/fields/ScopeField"
import { Attachment } from "./Attachment"
import { CreateFailed, CreateSteps, NAME_INPUT, Ready, ReadyCard } from "./Create"
import { EngineError } from "./EngineError"
import { Found, settledSettings } from "./Findings"
import { QuestionCard, QuestionText } from "./Question"
import { ReadingMessage, readingStays, useLoaderIdea } from "./Reading"
import { SettingsCard } from "./SettingsCard"
import { ClaimMark } from "../livechat/ideas/evidence/ClaimMark"
import { SettingsSentence } from "../livechat/ideas/evidence/SettingsSentence"
import { ToolCard } from "../livechat/ideas/evidence/ToolCard"
import { FlyIn } from "../livechat/ideas/question/FlyIn"
import { useIdea } from "./ideas"
import type { Answers, SettingValue } from "./useAnswers"
import type { useCreateRun } from "./useCreateRun"
import { QUESTION_SHORT, valueTitle } from "./words"

export type Message = {
  id: string
  /** The step it belongs to: once the thread moves past a step, the step folds to one line. */
  step: string
  from: "ai" | "user"
  /** Roughly how much there is to read, for the typing pause. */
  len: number
  body?: ReactNode
  card?: ReactNode
  /** A user message that isn't a bubble (the PDF). */
  plain?: boolean
  /** What to focus when this message arrives because of something the user did. */
  focus?: string
}

/** A step folded away: one line that says what was settled, and how it went. */
export type StepSummary = { text: ReactNode; tone?: "done" | "failed" }

export type ThreadInput = {
  flow: UploadFlow
  validFile: boolean
  rejectedAt: number
  attempt: number
  failures: Record<number, SetupFailure>
  run: EngineRun
  rec: SetupRecommendation | null
  chat: Answers
  create: ReturnType<typeof useCreateRun>
  onRetry: () => void
  onManual: () => void
  onAnswer: (fact: SetupBookFactId, value: string) => void
  onSetting: (id: SetupSettingId, value: SettingValue) => void
  onCreate: () => void
  onRename: () => void
}

/**
 * The conversation, derived from state on every render and grouped in steps: the book, what was
 * found, each question, the ready setup, each create. Nothing is stored as text, so an answer
 * changed further up re-derives everything below it (ids stay, so the reveal doesn't replay them).
 */
export function useThread(input: ThreadInput): { messages: Message[]; summaries: Record<string, StepSummary> } {
  const { i18n } = useLingui()
  const { flow, rec, chat, run, create } = input
  const loader = useLoaderIdea()
  const questionIdea = useIdea("question")
  const evidenceIdea = useIdea("evidence")
  const file = flow.file
  const scope = useScopeSummary(flow.pageCount)
  // Ids end up in CSS selectors (focus), so the file key is made safe for them.
  const fk = flow.fileKey.replace(/[^a-z0-9]/gi, "-")
  const messages: Message[] = []
  const summaries: Record<string, StepSummary> = {}
  let step = "book"
  const ai = (id: string, len: number, body?: ReactNode, card?: ReactNode, focus?: string) => messages.push({ id, step, from: "ai", len, body, card, focus })
  const user = (id: string, body: ReactNode, plain?: boolean) => messages.push({ id, step, from: "user", len: 0, body, plain })
  const done = { messages, summaries }

  ai("hello", 50, <Trans>Hi! Send me the PDF of your book and I&apos;ll set it up with you.</Trans>)

  if (input.rejectedAt && !input.validFile)
    ai(
      `rejected-${input.rejectedAt}`,
      50,
      <Trans>
        <strong className="font-semibold">That file isn&apos;t a PDF.</strong> Send a PDF and we&apos;ll start.
      </Trans>,
    )

  if (file && flow.error) {
    user(
      `bad-${fk}`,
      <span className="inline-flex items-center gap-2">
        <FileWarning className="size-4" />
        {file.name}
      </span>,
    )
    ai(
      `bad-reply-${fk}`,
      70,
      flow.error === "password" ? (
        <Trans>
          <strong className="font-semibold">This PDF is password-protected.</strong> Remove the password, or send another file.
        </Trans>
      ) : (
        <Trans>
          <strong className="font-semibold">I couldn&apos;t open this PDF.</strong> It may be damaged. Export it again, or send another file.
        </Trans>
      ),
    )
  }

  if (!file || !input.validFile) return done

  const key = `${fk}-${input.attempt}`
  user(`pdf-${fk}`, <Attachment flow={flow} frozen={create.locked} />, true)
  summaries.book = {
    text: (
      <>
        <span className="font-semibold text-foreground">{flow.title}</span> · {scope}
      </>
    ),
  }
  if (input.attempt > 0) user(`retry-${key}`, <Trans>Try again</Trans>)
  const failure = input.failures[input.attempt]
  if ((!rec || readingStays(loader)) && !failure) ai(`reading-${key}`, 60, <ReadingMessage idea={loader} file={file} pageCount={flow.pageCount} run={run} rec={rec} onManual={input.onManual} />)
  if (failure) ai(`failed-${key}`, 70, <EngineError failure={failure} current onRetry={input.onRetry} onManual={input.onManual} />, undefined, `#msg-failed-${key} button`)

  const derived = chat.derived
  if (!rec || !derived) return done
  const title = (id: SetupSettingId) => {
    const v = valueTitle(id, derived.effective[id]?.value)
    return v ? i18n._(v) : String(derived.effective[id]?.value)
  }

  // What it found, in one message.
  step = "found"
  ai(`found-${key}`, 90, <Found rec={rec} derived={derived} file={file} />, evidenceIdea === "e25" ? <ToolCard rec={rec} derived={derived} /> : undefined)
  const settled = settledSettings(rec, derived)
  const genreAsked = derived.asked.some((f) => f.id === "genre")
  summaries.found = {
    text: [!genreAsked ? i18n._(FACT_SHORT.genre[derived.proposed.genre]!) : null, ...(["renderStrategy", "pageGrouping"] as SetupSettingId[]).filter((id) => settled.includes(id)).map(title)].filter(Boolean).join(" · "),
  }

  // The questions, one at a time.
  const total = derived.asked.length
  const skipped = derived.asked.filter((f) => chat.skipped.includes(f.id))
  for (const [i, fact] of derived.asked.entries()) {
    if (chat.skipped.includes(fact.id)) continue
    step = `q-${fact.id}`
    const labelId = `q-${fact.id}-${key}`
    ai(
      `q-${fact.id}-${key}`,
      60,
      <span id={labelId}>
        <QuestionText fact={fact} index={i + 1} total={total} mark={<ClaimMark file={file} pages={fact.evidencePages} />} />
      </span>,
      <QuestionCard rec={rec} fact={fact} answers={derived.current} chosen={chat.answers[fact.id]} onAnswer={(v) => input.onAnswer(fact.id, v)} frozen={create.locked} file={file} labelId={labelId} />,
      questionIdea === "d21" ? `#msg-q-${fact.id}-${key} [data-q-first], #msg-q-${fact.id}-${key} [aria-pressed]` : `#msg-q-${fact.id}-${key} [aria-pressed]`,
    )
    const answer = chat.answers[fact.id]
    if (!answer) return done
    user(`a-${fact.id}-${key}`, questionIdea === "d19" ? <FlyIn flight={fact.id}>{i18n._(FACT_SHORT[fact.id][answer]!)}</FlyIn> : i18n._(FACT_SHORT[fact.id][answer]!))
    summaries[step] = {
      text: (
        <>
          {i18n._(QUESTION_SHORT[fact.id]!)} <span className="font-semibold text-foreground">{i18n._(FACT_SHORT[fact.id][answer]!)}</span>
        </>
      ),
    }
  }
  if (skipped.length) {
    step = "skip"
    user(`skip-${key}`, <Trans>Skip to settings</Trans>)
    ai(`skip-reply-${key}`, 40, <Trans>Sure, I went with my guesses. You can change them below.</Trans>)
    summaries.skip = { text: <Trans>Skipped the questions: used my guesses</Trans> }
  }

  // Ready: the setup on one line, the name, Create.
  step = "ready"
  ai(
    `ready-${key}`,
    30,
    total === 0 ? <Trans>Nothing to ask. Here&apos;s the setup: name it and create it.</Trans> : <Trans>Thanks! Here&apos;s the setup: name it and create it.</Trans>,
    <ReadyCard locked={create.locked} onCreate={input.onCreate} setup={
        evidenceIdea === "e24" ? (
          <SettingsSentence rec={rec} derived={derived} onChange={input.onSetting} frozen={create.locked} onAllSettings={input.onManual} />
        ) : (
          <SettingsCard rec={rec} derived={derived} onChange={input.onSetting} frozen={create.locked} numPages={flow.pageCount} file={file} onAllSettings={input.onManual} />
        )
      } />,
    `#${NAME_INPUT}`,
  )
  summaries.ready = { text: [title("preset"), title("renderStrategy"), title("pageGrouping")].join(" · ") }

  create.runs.forEach((r, i) => {
    step = `create-${r.n}`
    const current = i === create.runs.length - 1
    user(`create-${key}-${r.n}`, <Trans>Create “{r.name}”</Trans>)
    ai(`creating-${key}-${r.n}`, 20, <CreateSteps run={r} />)
    if (r.status === "done") ai(`done-${key}-${r.n}`, 30, undefined, <Ready run={r} onOpen={() => create.open(r.label!)} />, `#msg-done-${key}-${r.n} button`)
    if (r.status === "failed") {
      ai(`failed-create-${key}-${r.n}`, 60, <CreateFailed run={r} current={current} onRetry={input.onCreate} onRename={input.onRename} />, undefined, `#msg-failed-create-${key}-${r.n} button`)
      summaries[step] = { text: <Trans>Couldn&apos;t create “{r.name}”</Trans>, tone: "failed" }
    }
  })
  return done
}
