import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { useStore } from "@tanstack/react-form"
import { plural } from "@lingui/core/macro"
import { Trans, useLingui } from "@lingui/react/macro"
import { BookCheck, ChevronLeft, ChevronRight, List, NotebookPen } from "lucide-react"
import type { SetupBookFactId, SetupSettingId } from "@adt/types"
import { usePageThumb } from "@/components/wizard/core/pdf/usePageThumb"
import { useWizardForm } from "@/components/wizard/core/wizardForm"
import { cn } from "@/lib/utils"
import { PrimaryButton } from "../../../../core/ui"
import { useBookAspect } from "../../../loader/useBookAspect"
import type { EngineRun } from "../../../engine/useEngineRun"
import { FACT_TOPIC, SHORT_QUESTION, TOPIC_PAGES, TOPIC_TEXT } from "../words"
import { SettingsBookmark } from "../bookmarks/SettingsBookmark"
import { SettingsList } from "../bookmarks/SettingsList"
import { Flags, type Flag } from "../book/Flags"
import { OpenBook, bookSize } from "../book/OpenBook"
import { stepView, type SettingValue } from "../model"
import { NoteCard } from "../notes/NoteCard"
import { NotesRail } from "../notes/NotesRail"
import { QuestionCard } from "../notes/QuestionCard"
import { useBookState, useSettingWords } from "../useBookState"
import { GRADIENT, Heading } from "./Heading"
import { NamePlate, useNameOk } from "./NamePlate"
import { ActionBar, PageNav, SlowNote, TextButton } from "./parts"
import { Failure } from "./Failure"
import { usePageCount, useStageLayout } from "./useStageLayout"

const READ_FLIP_MS = 1900
type Step = "ask" | "ready" | "noticed" | "list"

type Props = {
  file: File
  /** The cover the upload step already drew, so the book opens from it at once. */
  coverSrc?: string
  run: EngineRun
  state: ReturnType<typeof useBookState>
  opening: boolean
  onRetry: () => void
  onCancel: () => void
  onBack: () => void
  onManual: () => void
  onCreate: () => void
}

/**
 * The open book, one thing at a time. While the engine reads, the pages turn. Then each question
 * is a note pinned beside its page ("Question 1 of 2"); after the questions (or at once when there
 * are none) the book is ready: a one-line summary and Create. "What we noticed" walks through the
 * notes one by one; the one "Settings" bookmark holds the six settings; "See everything" is the
 * list. Create closes the book and hands over to the create step.
 */
export function OpenStage({ file, coverSrc, run, state, opening, onRetry, onCancel, onBack, onManual, onCreate }: Props) {
  const { t, i18n } = useLingui()
  const words = useSettingWords()
  const form = useWizardForm()
  const label = useStore(form.store, (s) => s.values.label)
  const nameOk = useNameOk()
  const aspect = useBookAspect(file) ?? 0.72
  const counted = usePageCount(file)
  const rec = run.status === "done" ? run.rec : null
  const numPages = rec?.pageCount ?? counted
  const base = useStageLayout(aspect)
  const reading = run.status === "running" || run.status === "idle"
  const [page, setPage] = useState(2)
  const [step, setStep] = useState<Step>("ready")
  const [question, setQuestion] = useState(0)
  const [noteAt, setNoteAt] = useState(0)
  const [announce, setAnnounce] = useState("")
  const [closing, setClosing] = useState(false)
  // The ready step makes room for the name and its links under the book.
  const shrink = base.wide && !reading && step === "ready" ? 0.82 : 1
  const layout = { ...base, pageW: Math.floor(base.pageW * shrink), pageH: Math.floor(base.pageH * shrink) }
  const thumbW = Math.max(200, Math.round(base.pageW / 50) * 50)
  const thumb = usePageThumb(file, coverSrc ? 0 : 1, thumbW)
  const cover = coverSrc ?? thumb
  const landed = useRef<string | null>(null)
  const questions = state.questions
  const notes = state.notes

  const go = (next: Step, n?: number) => {
    setStep(next)
    if (n !== undefined) setPage(n)
    window.setTimeout(() => document.getElementById("open-book-heading")?.focus({ preventScroll: true }), 30)
  }

  // While reading, the pages turn on their own through the first part of the book.
  useEffect(() => {
    if (!reading || numPages < 3) return
    const id = window.setInterval(
      () =>
        setPage((p) => {
          const next = stepView(p, numPages, layout.single, 1)
          return next > Math.min(numPages, 18) || next === p ? 2 : next
        }),
      READ_FLIP_MS,
    )
    return () => window.clearInterval(id)
  }, [reading, numPages, layout.single])

  // When the answer lands: the first question on its page, or straight to ready.
  useEffect(() => {
    if (!rec || landed.current === rec.id) return
    landed.current = rec.id
    const first = questions[0]
    setQuestion(0)
    setNoteAt(0)
    if (first) go("ask", first.evidencePages[0] ?? rec.previewPage)
    else go("ready", rec.previewPage)
    setAnnounce(questions.length ? plural(questions.length, { one: "The AI has read your book. It has # question.", other: "The AI has read your book. It has # questions." }) : t`The AI has read your book. It is ready to create.`)
  }, [rec, questions, t])

  const settings = state.settings
  const summary = useMemo(() => settings.filter((s) => s.id === "preset" || s.id === "renderStrategy" || s.id === "pageGrouping").map((s) => words.value(s.id, s.value)), [settings, words])

  if (run.status === "failed") return <Failure cover={cover} failure={run.failure} onRetry={onRetry} onManual={onManual} onBack={onCancel} />

  const answer = (fact: SetupBookFactId, value: string) => {
    const changed = state.answer(fact, value)
    setAnnounce(changed.length ? changed.map((c) => t`${words.name(c.id)} is now ${words.value(c.id, c.value)}.`).join(" ") : t`No setting changed.`)
  }
  const change = (id: SetupSettingId, value: SettingValue) => {
    state.change(id, value)
    setAnnounce(t`${words.name(id)} is now ${words.value(id, value)}.`)
  }
  const showPage = (n: number) => {
    if (step === "list") setStep("ready")
    setPage(n)
  }
  const stepPage = (dir: 1 | -1) => setPage((p) => stepView(p, numPages, layout.single, dir))

  const ask = step === "ask" && rec ? questions[question] : undefined
  const nextQuestion = () => {
    if (!ask) return
    if (!state.answered.has(ask.id)) {
      setAnnounce(t`Pick an answer first.`)
      document.querySelector<HTMLInputElement>("#open-book-note input")?.focus()
      return
    }
    const next = questions[question + 1]
    if (next) {
      setQuestion(question + 1)
      go("ask", next.evidencePages[0] ?? page)
    } else go("ready", rec?.previewPage)
  }
  const note = step === "noticed" ? notes[noteAt] : undefined
  const toNote = (i: number) => {
    setNoteAt(i)
    const n = notes[i]
    if (n?.pages[0]) setPage(n.pages[0])
  }
  const create = () => {
    const open = state.open[0]
    if (open) {
      setQuestion(questions.indexOf(open))
      go("ask", open.evidencePages[0] ?? page)
      setAnnounce(t`Answer this question first.`)
      return
    }
    if (!nameOk(label)) {
      document.getElementById("wizard-project-name")?.focus()
      return
    }
    if (step === "list") return onCreate()
    setClosing(true)
  }

  const topicOf = (key: string) => (key === "text" ? i18n._(TOPIC_TEXT) : key === "pages" ? i18n._(TOPIC_PAGES) : i18n._(FACT_TOPIC[key as SetupBookFactId]))
  const flagsOn = (n: number): Flag[] => {
    if (ask && ask.evidencePages.includes(n)) return [{ key: ask.id, number: question + 1, topic: topicOf(ask.id), tone: state.answered.has(ask.id) ? "done" : "ask" }]
    if (note && note.pages.includes(n)) return [{ key: note.key, number: noteAt + 1, topic: topicOf(note.key), tone: "plain" }]
    return []
  }
  const sideOf = (n: number) => (layout.single ? "single" : n === 1 || n % 2 === 1 ? "right" : "left") as "left" | "right" | "single"
  const lit = ask ? ask.evidencePages : (note?.pages ?? [])
  const size = bookSize(layout.pageW, layout.pageH, layout.single)
  const ready = !reading && step === "ready"
  const withCard = !reading && (step === "ask" || step === "noticed")

  const book = (
    <div className={cn("relative shrink-0", ready && !layout.wide && "mt-10")} style={{ width: size.width, height: size.height }}>
      <OpenBook
        file={file}
        numPages={Math.max(numPages, 1)}
        single={layout.single}
        page={page}
        pageW={layout.pageW}
        pageH={layout.pageH}
        cover={cover}
        opening={opening}
        closing={closing}
        onClosed={onCreate}
        lit={lit}
        overlay={(n) => <Flags flags={flagsOn(n)} active={ask?.id ?? note?.key ?? null} side={sideOf(n)} edge={layout.wide ? "top" : "bottom"} onPick={() => document.querySelector<HTMLElement>("#open-book-note button, #open-book-note input")?.focus()} />}
        label={reading ? t`Your book, open while the AI reads it` : t`Your book`}
        onStep={stepPage}
      >
        {ready && (
          <SettingsBookmark
            settings={settings}
            layout={layout.wide ? "side" : "top"}
            onChange={change}
            onShowPages={showPage}
            className={cn("absolute -z-10 transition-opacity duration-200 animate-[am-fade-up_0.45s_cubic-bezier(0.22,1,0.36,1)_both] motion-reduce:animate-none", closing && "pointer-events-none opacity-0", layout.wide ? "left-[calc(100%-16px)] top-[26px]" : "bottom-[calc(100%-14px)] right-[28px]")}
          />
        )}
      </OpenBook>
    </div>
  )

  // The step's heading, card and primary action.
  let heading: ReactNode
  let card: ReactNode = null
  let primary: ReactNode = null
  let backLabel: ReactNode | undefined
  let back = onBack
  if (reading) {
    heading = (
      <Heading
        stepKey="reading"
        title={
          <Trans>
            Reading <span className={GRADIENT}>your book</span>
          </Trans>
        }
        line={<Trans>This takes a few seconds.</Trans>}
      />
    )
    backLabel = <Trans>Cancel</Trans>
    back = onCancel
  } else if (ask && rec && state.answers) {
    heading = <Heading stepKey={`ask-${question}`} kicker={questions.length > 1 ? <Trans>Question {question + 1} of {questions.length}</Trans> : <Trans>One question</Trans>} title={i18n._(SHORT_QUESTION[ask.id])} />
    card = <QuestionCard key={ask.id} rec={rec} fact={ask} answers={state.answers} answered={state.answered.has(ask.id)} onAnswer={answer} onShowPage={showPage} />
    primary = <PrimaryButton className="max-sm:px-4" onClick={nextQuestion}>{question + 1 < questions.length ? <Trans>Next</Trans> : <Trans>Done</Trans>}</PrimaryButton>
    if (question > 0)
      back = () => {
        const prev = questions[question - 1]!
        setQuestion(question - 1)
        go("ask", prev.evidencePages[0] ?? page)
      }
  } else if (note && rec && state.answers) {
    heading = (
      <Heading
        stepKey="noticed"
        kicker={<Trans>Note {noteAt + 1} of {notes.length}</Trans>}
        title={
          <Trans>
            What we <span className={GRADIENT}>noticed</span>
          </Trans>
        }
      />
    )
    card = (
      <div className="flex flex-col gap-3">
        <NoteCard key={note.key} finding={note} number={noteAt + 1} rec={rec} answers={state.answers} answered={note.key !== "text" && note.key !== "pages" && state.answered.has(note.key)} onAnswer={answer} onShowPage={showPage} />
        <div className="flex items-center justify-between">
          <button type="button" onClick={() => toNote(noteAt - 1)} disabled={noteAt === 0} className="inline-flex h-9 items-center gap-1 rounded-full px-3 text-[13px] font-semibold text-muted-foreground transition-colors hover:bg-muted disabled:opacity-35">
            <ChevronLeft aria-hidden className="size-4" />
            <Trans>Previous</Trans>
          </button>
          <button type="button" onClick={() => toNote(noteAt + 1)} disabled={noteAt + 1 >= notes.length} className="inline-flex h-9 items-center gap-1 rounded-full px-3 text-[13px] font-semibold text-muted-foreground transition-colors hover:bg-muted disabled:opacity-35">
            <Trans>Next note</Trans>
            <ChevronRight aria-hidden className="size-4" />
          </button>
        </div>
      </div>
    )
    primary = <PrimaryButton className="max-sm:px-4" onClick={() => go("ready", rec.previewPage)}>{<Trans>Done</Trans>}</PrimaryButton>
    back = () => go("ready", rec.previewPage)
  } else if (rec) {
    heading = (
      <Heading
        stepKey={step === "list" ? "list" : "ready"}
        title={
          <Trans>
            Ready to <span className={GRADIENT}>create</span>
          </Trans>
        }
        line={<span className="font-semibold text-foreground">{summary.join(" · ")}</span>}
      />
    )
    primary = (
      <PrimaryButton className="max-sm:px-4" onClick={create} icon={<BookCheck className="size-4" />}>
        <Trans>Create book</Trans>
      </PrimaryButton>
    )
    if (step === "list") back = () => setStep("ready")
    else if (questions.length)
      back = () => {
        setQuestion(questions.length - 1)
        go("ask", questions[questions.length - 1]!.evidencePages[0] ?? page)
      }
  }

  const readyLinks = rec && step === "ready" && (
    <div className="-mt-1 flex flex-col items-center gap-0.5">
      <div className="flex flex-wrap items-center justify-center gap-1">
        <TextButton onClick={() => {
            toNote(0)
            go("noticed")
          }} className="h-9 gap-1.5 px-2.5 text-[13.5px]">
          <NotebookPen aria-hidden className="size-4" />
          <Trans>What we noticed ({notes.length})</Trans>
        </TextButton>
        <TextButton onClick={() => setStep("list")} className="h-9 gap-1.5 px-2.5 text-[13.5px]">
          <List aria-hidden className="size-4" />
          <Trans>See everything</Trans>
        </TextButton>
      </div>
      {!rec.secondOpinion && (
        <p className="text-[12.5px] text-muted-foreground">
          <Trans>Only one AI reading finished, so give the notes a look.</Trans>
        </p>
      )}
    </div>
  )

  return (
    <div className={cn("flex min-h-full w-full flex-col", closing && "[&_[data-fade]]:pointer-events-none [&_[data-fade]]:opacity-0")}>
      <span role="status" className="sr-only">
        {announce}
      </span>
      <div className="mx-auto flex w-full max-w-[1280px] flex-1 flex-col items-center gap-7 pb-8 pt-7">
        <div data-fade className="flex w-full flex-col items-center gap-2 transition-opacity duration-300">
          {heading}
          {readyLinks}
        </div>

        {step === "list" && rec && state.answers ? (
          <div className="grid w-full gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
            <section aria-labelledby="list-notes" className="flex flex-col gap-3">
              <h2 id="list-notes" className="text-[13px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                <Trans>Notes</Trans>
              </h2>
              <NotesRail rec={rec} notes={notes} answers={state.answers} answered={state.answered} active={null} flat onActivate={() => {}} onAnswer={answer} onShowPage={showPage} />
            </section>
            <section aria-labelledby="list-settings" className="flex flex-col gap-3">
              <h2 id="list-settings" className="text-[13px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                <Trans>Settings</Trans>
              </h2>
              <SettingsList settings={settings} onChange={change} onShowPages={showPage} />
              <NamePlate className="mt-4" />
            </section>
          </div>
        ) : withCard && layout.wide ? (
          <div className="flex items-start justify-center gap-10">
            <div id="open-book-note" className="shrink-0 pt-4 animate-[am-pop_0.4s_cubic-bezier(0.34,1.56,0.64,1)_both] motion-reduce:animate-none" style={{ width: layout.railW }} key={ask?.id ?? note?.key}>
              {card}
            </div>
            <div className="flex flex-col items-center gap-4" style={{ paddingRight: layout.tabsW }}>
              {book}
              <PageNav className="h-11" page={page} numPages={numPages} single={layout.single} onStep={stepPage} />
            </div>
          </div>
        ) : withCard ? (
          <div className="flex w-full flex-col items-center gap-6">
            <div id="open-book-note" className="w-full max-w-[460px] animate-[am-pop_0.4s_cubic-bezier(0.34,1.56,0.64,1)_both] motion-reduce:animate-none" key={ask?.id ?? note?.key}>
              {card}
            </div>
            {book}
            <PageNav className="mt-4" page={page} numPages={numPages} single={layout.single} onStep={stepPage} />
          </div>
        ) : (
          <div className="flex flex-col items-center gap-6" style={layout.wide && ready ? { paddingLeft: layout.tabsW } : undefined}>
            {book}
            {reading ? (
              <SlowNote shown={run.slow} onManual={onManual} />
            ) : (
              <div data-fade className="transition-opacity duration-300">
                <NamePlate className="w-[min(340px,calc(100vw-32px))]" />
              </div>
            )}
          </div>
        )}
      </div>
      <ActionBar backLabel={backLabel} onBack={back} onManual={onManual} primary={primary} />
    </div>
  )
}
