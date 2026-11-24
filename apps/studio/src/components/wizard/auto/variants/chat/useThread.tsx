/* eslint-disable lingui/no-unlocalized-strings -- message ids and CSS selectors, never shown */
import type { ReactNode } from "react"
import { Plural, Trans, useLingui } from "@lingui/react/macro"
import { FileWarning } from "lucide-react"
import type { SetupBookFactId, SetupRecommendation, SetupSettingId } from "@adt/types"
import type { SetupFailure } from "../../recommendation/client"
import type { EngineRun } from "../../engine/useEngineRun"
import { FACT_SHORT } from "../../engine/words"
import type { UploadFlow } from "../../../start/upload/useUploadFlow"
import { Attachment } from "./Attachment"
import { Chip } from "./bubbles"
import { CreateFailed, CreateSteps, NameCard, NAME_INPUT, Ready } from "./Create"
import { EngineError } from "./EngineError"
import { AskIntro, KindFinding, LookFinding, PagesFinding, Pill, RestFinding } from "./Findings"
import { QuestionCard, QuestionText } from "./Question"
import { SettingsCard } from "./SettingsCard"
import { settingsTouchedBy, settingsWaitingOn, type Answers, type SettingValue } from "./useAnswers"
import type { useCreateRun } from "./useCreateRun"

export type Message = {
  id: string
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

export type ThreadInput = {
  flow: UploadFlow
  validFile: boolean
  rejectedAt: number
  attempt: number
  failures: Record<number, SetupFailure>
  run: EngineRun
  rec: SetupRecommendation | null
  chat: Answers
  edited: Set<SetupBookFactId>
  create: ReturnType<typeof useCreateRun>
  onRetry: () => void
  onManual: () => void
  onAnswer: (fact: SetupBookFactId, value: string) => void
  onSetting: (id: SetupSettingId, value: SettingValue) => void
  onEditScope: () => void
  onCreate: () => void
  onRename: () => void
}

/**
 * The conversation, derived from state on every render: what the assistant says and what the user
 * answered, in order. Nothing is stored as text, so an answer changed further up just re-derives
 * the messages below it (ids stay, so the reveal doesn't replay them).
 */
export function useThread(input: ThreadInput): Message[] {
  const { i18n } = useLingui()
  const { flow, rec, chat, run, create } = input
  const file = flow.file
  // Ids end up in CSS selectors (focus), so the file key is made safe for them.
  const fk = flow.fileKey.replace(/[^a-z0-9]/gi, "-")
  const out: Message[] = []
  const ai = (id: string, len: number, body?: ReactNode, card?: ReactNode, focus?: string) => out.push({ id, from: "ai", len, body, card, focus })
  const user = (id: string, body: ReactNode, plain?: boolean) => out.push({ id, from: "user", len: 0, body, plain })

  ai("hello", 70, <Trans>Hi! I&apos;m the ADT Assistant. Send me the PDF of the book you want to convert.</Trans>)
  ai("hello-2", 80, <Trans>I&apos;ll look through it, tell you what I see, and only ask when I&apos;m not sure.</Trans>)

  if (input.rejectedAt && !input.validFile)
    ai(
      `rejected-${input.rejectedAt}`,
      50,
      <Trans>
        <strong className="font-semibold">That file isn&apos;t a PDF.</strong> Only PDF files can be converted. Send a PDF and we&apos;ll start.
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
      90,
      flow.error === "password" ? (
        <Trans>
          <strong className="font-semibold">This PDF is password-protected.</strong> Remove the password and send it again, or send another file.
        </Trans>
      ) : (
        <Trans>
          <strong className="font-semibold">I couldn&apos;t open this PDF.</strong> The file may be damaged. Export it again, or send another file.
        </Trans>
      ),
    )
  }

  if (!file || !input.validFile) return out

  user(`pdf-${fk}`, <Attachment flow={flow} frozen={create.locked} />, true)
  ai(
    `got-${fk}`,
    70,
    <Trans>
      Got it: <Plural value={flow.pageCount} one="# page" other="# pages" />. Choose which pages to convert on the card if you don&apos;t want all of them.
    </Trans>,
  )

  // Each attempt narrates what the engine will do, honestly: it reports no progress, so neither do we.
  for (let a = 0; a <= input.attempt; a++) {
    const key = `${fk}-${a}`
    if (a > 0) user(`retry-${key}`, <Trans>Try again</Trans>)
    ai(`measure-${key}`, 110, a === 0 ? <Trans>Let me look at it. First I measure the pages: their shape, whether facing pages belong together, and whether the PDF has real text.</Trans> : <Trans>Starting over: measuring the pages again.</Trans>)
    ai(`read-${key}`, 120, a === 0 ? <Trans>Then two separate AI readings look at sample pages. Where they agree, I decide. Where they don&apos;t, I&apos;ll ask you.</Trans> : <Trans>Then the two readings, as before.</Trans>)
    const failure = input.failures[a]
    if (a === input.attempt && run.status === "running" && run.slow)
      ai(
        `slow-${key}`,
        90,
        <div className="flex flex-col gap-2">
          <p>
            <Trans>This is taking longer than usual. I&apos;ll keep at it, or you can set the book up yourself. Your PDF stays.</Trans>
          </p>
          <div>
            <Chip onClick={input.onManual}>
              <Trans>Set it up myself</Trans>
            </Chip>
          </div>
        </div>,
      )
    if (failure) ai(`failed-${key}`, 90, <EngineError failure={failure} current={a === input.attempt} onRetry={input.onRetry} onManual={input.onManual} />, undefined, `#msg-failed-${key} button`)
  }

  const derived = chat.derived
  if (!rec || !derived) return out
  const key = `${fk}-${input.attempt}`

  // What it found, for the settings no question hangs on.
  const waiting = settingsWaitingOn(rec, derived.asked, derived.proposed)
  const genreAsked = derived.asked.some((f) => f.id === "genre")
  if (!genreAsked) ai(`kind-${key}`, 90, <KindFinding rec={rec} derived={derived} file={file} />)
  if (!waiting.has("pageGrouping")) ai(`pages-${key}`, 110, <PagesFinding rec={rec} derived={derived} file={file} />)
  if (!waiting.has("renderStrategy")) ai(`look-${key}`, 80, <LookFinding rec={rec} derived={derived} file={file} />)
  const rest = (["preset", "sectioningMode", "activitiesGenerator", "figureExtraction"] as SetupSettingId[]).filter((id) => !waiting.has(id) && !(id === "preset" && !genreAsked))
  if (rest.length) ai(`rest-${key}`, 60, <RestFinding ids={rest} derived={derived} />)
  if (!rec.secondOpinion)
    ai(
      `one-reading-${key}`,
      110,
      <Trans>
        <strong className="font-semibold">One heads-up:</strong> only one of my two readings came back, so I couldn&apos;t double-check any of this. Give the setup a look before you create the book.
      </Trans>,
    )
  ai(`ask-intro-${key}`, 50, <AskIntro count={derived.asked.length} />)

  // The questions, one at a time.
  let skipShown = false
  for (const fact of derived.asked) {
    if (chat.skipped.includes(fact.id)) {
      if (!skipShown) {
        skipShown = true
        user(`skip-${key}`, <Trans>Skip to settings</Trans>)
        ai(
          `skip-reply-${key}`,
          70,
          <div className="flex flex-col gap-2">
            <p>
              <Trans>Sure. I went with my guesses, and you can change anything in the setup below:</Trans>
            </p>
            <ul className="flex flex-col gap-0.5 text-[14px]">
              {derived.asked
                .filter((f) => chat.skipped.includes(f.id))
                .map((f) => (
                  <li key={f.id} className="text-muted-foreground">
                    <QuestionShort fact={f.id} /> <span className="font-semibold text-foreground">{i18n._(FACT_SHORT[f.id][derived.current[f.id]]!)}</span>
                  </li>
                ))}
            </ul>
          </div>,
        )
      }
      continue
    }
    const labelId = `q-${fact.id}-${key}`
    ai(
      `q-${fact.id}-${key}`,
      110,
      <span id={labelId}>
        <QuestionText fact={fact} />
      </span>,
      <QuestionCard rec={rec} fact={fact} answers={derived.current} chosen={chat.answers[fact.id]} onAnswer={(v) => input.onAnswer(fact.id, v)} frozen={create.locked} file={file} labelId={labelId} />,
      `#msg-q-${fact.id}-${key} [aria-pressed]`,
    )
    const answer = chat.answers[fact.id]
    if (!answer) return out
    user(`a-${fact.id}-${key}`, i18n._(FACT_SHORT[fact.id][answer]!))
    const touched = settingsTouchedBy(rec, derived.current, fact.id)
    ai(
      `c-${fact.id}-${key}`,
      50,
      <div className="flex flex-col gap-2">
        <p>
          {input.edited.has(fact.id) ? <Trans>Updated.</Trans> : <Trans>Got it.</Trans>}{" "}
          {touched.length === 0 ? <Trans>That doesn&apos;t change any setting.</Trans> : touched.length === 1 ? <Trans>That sets:</Trans> : <Trans>That sets these:</Trans>}
        </p>
        {touched.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {touched.map((id) => (
              <Pill key={id} id={id} derived={derived} />
            ))}
          </div>
        )}
      </div>,
    )
  }

  // The setup, the name, then creating.
  ai(
    `settings-${key}`,
    60,
    <Trans>Here&apos;s the setup. Tap any setting to change it.</Trans>,
    <SettingsCard rec={rec} derived={derived} onChange={input.onSetting} frozen={create.locked} numPages={flow.pageCount} file={file} onEditScope={input.onEditScope} onAllSettings={input.onManual} />,
    `#msg-settings-${key} [aria-expanded]`,
  )
  ai(`name-${key}`, 30, <Trans>Last thing: what should we call it?</Trans>, <NameCard onCreate={input.onCreate} locked={create.locked} />, `#${NAME_INPUT}`)

  create.runs.forEach((r, i) => {
    const current = i === create.runs.length - 1
    user(`create-${key}-${r.n}`, <Trans>Create “{r.name}”</Trans>)
    ai(`creating-${key}-${r.n}`, 20, <CreateSteps run={r} />)
    if (r.status === "done") ai(`ready-${key}-${r.n}`, 30, undefined, <Ready run={r} onOpen={() => create.open(r.label!)} />, `#msg-ready-${key}-${r.n} button`)
    if (r.status === "failed") ai(`failed-create-${key}-${r.n}`, 60, <CreateFailed run={r} current={current} onRetry={input.onCreate} onRename={input.onRename} />, undefined, `#msg-failed-create-${key}-${r.n} button`)
  })
  return out
}

function QuestionShort({ fact }: { fact: SetupBookFactId }) {
  if (fact === "genre") return <Trans>Kind of book:</Trans>
  if (fact === "exercises") return <Trans>Tasks for the reader:</Trans>
  if (fact === "composition") return <Trans>Where the words are:</Trans>
  return <Trans>Labelled pictures:</Trans>
}
