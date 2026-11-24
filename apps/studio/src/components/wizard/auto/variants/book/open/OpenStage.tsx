import { useEffect, useMemo, useRef, useState } from "react"
import { useStore } from "@tanstack/react-form"
import { plural } from "@lingui/core/macro"
import { Trans, useLingui } from "@lingui/react/macro"
import type { SetupBookFactId, SetupSettingId } from "@adt/types"
import { usePageThumb } from "@/components/wizard/core/pdf/usePageThumb"
import { useWizardForm } from "@/components/wizard/core/wizardForm"
import { useReducedEffects } from "@/lib/effects"
import { cn } from "@/lib/utils"
import { useBookAspect } from "../../../loader/useBookAspect"
import type { EngineRun } from "../../../engine/useEngineRun"
import { FACT_TOPIC, TOPIC_PAGES, TOPIC_TEXT } from "../words"
import { Bookmarks } from "../bookmarks/Bookmarks"
import { SettingsList } from "../bookmarks/SettingsList"
import { Flags, type Flag } from "../book/Flags"
import { OpenBook, bookSize } from "../book/OpenBook"
import { stepView, viewOf, type SettingValue } from "../model"
import { NotesRail, WaitingNotes } from "../notes/NotesRail"
import { useBookState, useSettingWords } from "../useBookState"
import { Heading, ViewToggle, type HeadingState } from "./Heading"
import { NamePlate, useNameOk } from "./NamePlate"
import { ActionBar, PageNav, SlowNote, TextButton } from "./parts"
import { Failure } from "./Failure"
import { usePageCount, useStageLayout } from "./useStageLayout"

const READ_FLIP_MS = 1900
const FLASH_MS = 1800

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
 * The open book: while the engine reads, the real pages turn and the margin and bookmarks wait;
 * when the answer lands, the findings are notes in the margin (flags on the pages that show them),
 * the settings are bookmarks out of the book, and any note the AI is unsure about asks for an
 * answer. "Create book" closes the book and hands over to the create step.
 */
export function OpenStage({ file, coverSrc, run, state, opening, onRetry, onCancel, onBack, onManual, onCreate }: Props) {
  const { t, i18n } = useLingui()
  const words = useSettingWords()
  const form = useWizardForm()
  const label = useStore(form.store, (s) => s.values.label)
  const nameOk = useNameOk()
  const reduced = useReducedEffects()
  const aspect = useBookAspect(file) ?? 0.72
  const counted = usePageCount(file)
  const rec = run.status === "done" ? run.rec : null
  const numPages = rec?.pageCount ?? counted
  const layout = useStageLayout(aspect)
  const reading = run.status === "running" || run.status === "idle"
  const [page, setPage] = useState(2)
  const [active, setActive] = useState<string | null>(null)
  const [view, setView] = useState<"book" | "list">("book")
  const [flash, setFlash] = useState<Set<SetupSettingId>>(new Set())
  const [announce, setAnnounce] = useState("")
  const [closing, setClosing] = useState(false)
  const thumbW = Math.max(200, Math.round(layout.pageW / 50) * 50)
  const thumb = usePageThumb(file, coverSrc ? 0 : 1, thumbW)
  const cover = coverSrc ?? thumb
  const landed = useRef<string | null>(null)

  const numbered = useMemo(() => state.notes.map((n, i) => ({ ...n, number: i + 1 })), [state.notes])
  const topicOf = (key: string) => (key === "text" ? i18n._(TOPIC_TEXT) : key === "pages" ? i18n._(TOPIC_PAGES) : i18n._(FACT_TOPIC[key as SetupBookFactId]))

  // While reading, the pages turn on their own through the first part of the book.
  useEffect(() => {
    if (!reading || numPages < 3) return
    const id = window.setInterval(() => setPage((p) => {
      const next = stepView(p, numPages, layout.single, 1)
      return next > Math.min(numPages, 18) || next === p ? 2 : next
    }), READ_FLIP_MS)
    return () => window.clearInterval(id)
  }, [reading, numPages, layout.single])

  // When the answer lands: open the first note (a question if there is one) on its page.
  useEffect(() => {
    if (!rec || landed.current === rec.id) return
    landed.current = rec.id
    const first = state.notes.find((n) => n.pages.length) ?? null
    setActive(first?.key ?? null)
    setPage(first?.pages[0] ?? rec.previewPage)
    const asks = state.questions.length
    setAnnounce(asks ? plural(asks, { one: "The AI has read your book. # note needs your answer.", other: "The AI has read your book. # notes need your answer." }) : t`The AI has read your book. Its notes and the settings are ready.`)
    document.getElementById("open-book-heading")?.focus({ preventScroll: true })
  }, [rec, state.notes, state.questions.length, t])

  useEffect(() => {
    if (!flash.size) return
    const id = window.setTimeout(() => setFlash(new Set()), FLASH_MS)
    return () => window.clearTimeout(id)
  }, [flash])

  const showPage = (n: number) => {
    setView("book")
    setPage(n)
  }
  const activate = (key: string) => {
    const note = state.notes.find((n) => n.key === key)
    setActive((a) => (a === key && view === "book" ? null : key))
    const visible = viewOf(page, numPages, layout.single)
    if (note?.pages.length && !note.pages.some((n) => visible.includes(n))) setPage(note.pages[0]!)
  }
  const pickFlag = (key: string) => {
    setActive(key)
    document.getElementById(`note-card-${key}`)?.scrollIntoView({ block: "nearest", behavior: reduced ? "auto" : "smooth" })
  }
  const answer = (fact: SetupBookFactId, value: string) => {
    const changed = state.answer(fact, value)
    setFlash(new Set(changed.map((c) => c.id)))
    setAnnounce(changed.length ? changed.map((c) => t`${words.name(c.id)} is now ${words.value(c.id, c.value)}.`).join(" ") : t`No bookmark changed.`)
    const next = state.open.find((q) => q.id !== fact)
    if (next) {
      setActive(next.id)
      if (next.evidencePages[0]) setPage(next.evidencePages[0])
    }
  }
  const change = (id: SetupSettingId, value: SettingValue) => {
    state.change(id, value)
    setFlash(new Set([id]))
    setAnnounce(t`${words.name(id)} is now ${words.value(id, value)}.`)
  }
  const create = () => {
    const open = state.open[0]
    if (open) {
      setView("book")
      setActive(open.id)
      if (open.evidencePages[0]) setPage(open.evidencePages[0])
      setAnnounce(t`Answer the note on ${i18n._(FACT_TOPIC[open.id])} first.`)
      const card = document.getElementById(`note-card-${open.id}`)
      card?.scrollIntoView({ block: "center", behavior: reduced ? "auto" : "smooth" })
      card?.querySelector("input")?.focus({ preventScroll: true })
      return
    }
    if (!nameOk(label)) {
      document.getElementById("wizard-project-name")?.focus()
      return
    }
    if (view === "list") return onCreate()
    setClosing(true)
  }

  if (run.status === "failed") return <Failure cover={cover} failure={run.failure} onRetry={onRetry} onManual={onManual} onBack={onCancel} />

  const heading: HeadingState = reading ? "reading" : state.questions.length === 0 ? "found" : state.open.length === 0 ? "answered" : state.open.length === 1 ? "ask-one" : "ask-many"
  const flagsOn = (n: number): Flag[] =>
    rec
      ? numbered
          .filter((note) => note.pages.includes(n))
          .map((note) => ({ key: note.key, number: note.number, topic: topicOf(note.key), tone: note.asked ? (state.answered.has(note.key as SetupBookFactId) ? "done" : "ask") : "plain" }))
      : []
  const sideOf = (n: number) => (layout.single ? "single" : n === 1 || n % 2 === 1 ? "right" : "left") as "left" | "right" | "single"
  const activeNote = state.notes.find((n) => n.key === active)
  const size = bookSize(layout.pageW, layout.pageH, layout.single)
  const bookLabel = reading ? t`Your book, open while the AI reads it` : t`Your book, with the AI's notes`

  const notes =
    rec && state.answers ? (
      <NotesRail rec={rec} notes={state.notes} answers={state.answers} answered={state.answered} active={active} flat={view === "list"} onActivate={activate} onAnswer={answer} onShowPage={showPage} />
    ) : (
      <WaitingNotes />
    )

  const book = (
    <div className={cn("relative transition-opacity duration-500", layout.wide ? "" : "mt-[52px]")} style={{ width: size.width, height: size.height }}>
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
        lit={activeNote?.pages ?? []}
        overlay={(n) => <Flags flags={flagsOn(n)} active={active} side={sideOf(n)} edge={layout.wide ? "top" : "bottom"} onPick={pickFlag} />}
        label={bookLabel}
        onStep={(dir) => setPage((p) => stepView(p, numPages, layout.single, dir))}
      >
        <Bookmarks
          layout={layout.wide ? "side" : "top"}
          settings={rec ? state.settings : null}
          flash={flash}
          onChange={change}
          onShowPages={showPage}
          className={cn("absolute -z-10 transition-opacity duration-200", closing && "pointer-events-none opacity-0", layout.wide ? "left-[calc(100%-16px)] top-[22px]" : "inset-x-[12px] bottom-[calc(100%-14px)]")}
        />
      </OpenBook>
    </div>
  )

  return (
    <div className={cn("flex min-h-full w-full flex-col", closing && "[&_[data-fade]]:pointer-events-none [&_[data-fade]]:opacity-0")}>
      <span role="status" className="sr-only">
        {announce}
      </span>
      <div className="mx-auto flex w-full max-w-[1360px] flex-1 flex-col gap-6 pb-8 pt-7">
        <div data-fade className="transition-opacity duration-300">
          <Heading
            state={heading}
            compact={!layout.wide}
            aside={
              layout.wide ? (
                rec && <ViewToggle view={view} onView={setView} />
              ) : (
                <div className="flex flex-wrap items-center justify-center gap-2">
                  {rec && <ViewToggle view={view} onView={setView} />}
                  <TextButton onClick={onManual} className="h-9 sm:hidden">
                    <Trans>Set it up myself</Trans>
                  </TextButton>
                </div>
              )
            }
          />
        </div>

        {view === "list" && rec ? (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
            <section aria-labelledby="list-notes" className="flex flex-col gap-3">
              <h2 id="list-notes" className="text-[13px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                <Trans>Notes</Trans>
              </h2>
              {notes}
            </section>
            <section aria-labelledby="list-settings" className="flex flex-col gap-3">
              <h2 id="list-settings" className="text-[13px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                <Trans>Settings</Trans>
              </h2>
              <SettingsList settings={state.settings} onChange={change} onShowPages={showPage} />
              <NamePlate className="mt-4" />
            </section>
          </div>
        ) : layout.wide ? (
          <div className="grid items-start gap-10" style={{ gridTemplateColumns: `${layout.railW}px minmax(0,1fr)` }}>
            <aside data-fade aria-label={t`Notes`} className="pt-3 transition-opacity duration-300">
              {notes}
            </aside>
            <div className="flex flex-col items-center gap-5" style={{ paddingRight: layout.tabsW }}>
              {book}
              <div data-fade className="flex flex-wrap items-start justify-center gap-x-8 gap-y-3 transition-opacity duration-300">
                {reading ? <SlowNote shown={run.slow} onManual={onManual} /> : <PageNav className="h-11" page={page} numPages={numPages} single={layout.single} onStep={(dir) => setPage((p) => stepView(p, numPages, layout.single, dir))} />}
                {!reading && <NamePlate className="w-[340px]" />}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-5">
            {book}
            <div data-fade className={cn("flex w-full flex-col items-center gap-5 transition-opacity duration-300", rec && "pt-5")}>
              {reading ? <SlowNote shown={run.slow} onManual={onManual} /> : <PageNav page={page} numPages={numPages} single={layout.single} onStep={(dir) => setPage((p) => stepView(p, numPages, layout.single, dir))} />}
              <div className="w-full max-w-[560px] pt-2">{notes}</div>
              {!reading && <NamePlate className="w-full max-w-[560px] pt-2" />}
            </div>
          </div>
        )}
      </div>
      <ActionBar reading={reading} left={state.open.length} onBack={onBack} onManual={onManual} onCancel={onCancel} onCreate={create} />
    </div>
  )
}
