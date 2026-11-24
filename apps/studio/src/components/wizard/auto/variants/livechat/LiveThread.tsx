import { useEffect, useRef, useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { FastForward, Wrench } from "lucide-react"
import type { SetupBookFactId, SetupRecommendation, SetupSettingId } from "@adt/types"
import { FileDropOverlay } from "@/components/ui/file-drop-overlay"
import { FlowTopBar } from "@/components/FlowTopBar"
import type { SetupFailure } from "../../recommendation/client"
import { applySettings } from "../../engine/answers"
import { useEngineRun } from "../../engine/useEngineRun"
import { useWizardForm } from "../../../core/wizardForm"
import { DotGrid } from "../../../core/ui"
import "../../../core/flow.css"
import { useUploadFlow } from "../../../start/upload/useUploadFlow"
import { ComposerReply } from "../chat/Composer"
import { NAME_INPUT } from "../chat/Create"
import { useAnswers, type SettingValue } from "../chat/useAnswers"
import { useCreateRun } from "../chat/useCreateRun"
import { QUESTION_SHORT, SETTING_LABEL, valueTitle } from "../chat/words"
import { BookSurface } from "./BookSurface"
import { FoundSurface } from "./FoundSurface"
import { useMorph } from "./morph"
import { QuestionSurface } from "./QuestionSurface"
import { ReadySurface } from "./ReadySurface"
import "./livechat.css"

const AFTER_MORPH_MS = 520

/**
 * Living chat: the Add Book conversation where messages are surfaces. The one that needs the user
 * grows out of its bubble into a stage (drop, reading, a question, settings, making the book); when
 * it's done it shrinks back into a bubble that says what happened. Only one is open at a time; any
 * finished one grows back out when tapped. Morphs use the View Transitions API (see `useMorph`).
 */
export function LiveThread({ onManual }: { onManual: () => void }) {
  const { t, i18n } = useLingui()
  const form = useWizardForm()
  const flow = useUploadFlow()
  const morph = useMorph()
  const validFile = !!flow.file && flow.pageCount > 0 && !flow.error
  const [attempt, setAttempt] = useState(0)
  const [failures, setFailures] = useState<Record<number, SetupFailure>>({})
  const [rejectedAt, setRejectedAt] = useState(0)
  const [rec, setRec] = useState<SetupRecommendation | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [announce, setAnnounce] = useState("")
  const run = useEngineRun(validFile ? flow.file : null, attempt)
  const chat = useAnswers(rec)
  const create = useCreateRun()
  const scroller = useRef<HTMLDivElement>(null)

  /** After a morph, focus the heading of what's open now (unless the user is busy in something else). */
  const focusHead = (id: string, onlyIfLost = false) =>
    window.setTimeout(() => {
      const active = document.activeElement
      if (onlyIfLost && active && active !== document.body && active.isConnected) return
      document.getElementById(id)?.focus({ preventScroll: true })
    }, AFTER_MORPH_MS)

  // A new PDF starts over.
  useEffect(() => {
    setAttempt(0)
    setFailures({})
    setRec(null)
    setOpen(null)
    chat.reset()
  }, [flow.fileKey])
  useEffect(() => {
    if (flow.rejectedAt) setRejectedAt(flow.rejectedAt)
  }, [flow.rejectedAt])
  // The engine's answer (or failure) lands as a morph: the reading stage shrinks, the next step grows.
  useEffect(() => {
    if (run.status === "done" && run.rec !== rec) {
      morph(() => setRec(run.rec))
      const first = run.rec.facts.find((f) => f.ask)
      focusHead(first ? `lc-q-${first.id}-head` : "lc-ready-head", true)
    }
    if (run.status === "failed") morph(() => setFailures((f) => ({ ...f, [attempt]: run.failure })))
  }, [run.status])

  const derived = chat.derived
  const pending = derived?.pending ?? null
  const lastRun = create.runs[create.runs.length - 1]
  const auto = !rec ? "book" : pending ? `q-${pending.id}` : lastRun ? "create" : "ready"
  const active = open ?? auto

  const say = (id: SetupSettingId, value: SettingValue | undefined) => {
    const title = valueTitle(id, value)
    return `${i18n._(SETTING_LABEL[id])}: ${title ? i18n._(title) : String(value)}`
  }

  // Keep the open surface in view, and tell screen readers what's open now.
  useEffect(() => {
    const id = window.setTimeout(() => document.getElementById(`lc-at-${active}`)?.scrollIntoView({ block: active === "ready" || active === "book" ? "nearest" : "start", behavior: "smooth" }), AFTER_MORPH_MS)
    if (active === "book") setAnnounce(failures[attempt] ? t`I couldn't read your book.` : validFile ? t`Reading your book.` : "")
    else if (active.startsWith("q-") && pending && derived) setAnnounce(t`Question ${derived.asked.indexOf(pending) + 1} of ${derived.asked.length}: ${i18n._(QUESTION_SHORT[pending.id]!)}`)
    else if (active === "ready") setAnnounce(t`Ready to create.`)
    else if (active === "create" && lastRun?.status === "done") setAnnounce(t`Your book is ready to open.`)
    return () => window.clearTimeout(id)
  }, [active, validFile, failures, lastRun?.status])

  const openSurface = (id: string, head: string) => {
    morph(() => setOpen(id))
    focusHead(head)
  }
  const collapse = () => {
    morph(() => setOpen(null))
    focusHead(`lc-${auto === "create" ? "ready" : auto.startsWith("q-") ? `${auto}` : auto}-head`)
  }

  const manual = () => {
    if (derived) applySettings(form, derived.effective)
    onManual()
  }

  const onPick = (fact: SetupBookFactId, value: string) => {
    if (derived && rec) {
      const before = chat.answers[fact]
      if (before && before !== value) setAnnounce(t`Answer changed.`)
    }
    setOpen(null)
    chat.answer(fact, value)
    const next = derived?.asked.find((f) => f.id !== fact && !(f.id in chat.answers))
    focusHead(next ? `lc-q-${next.id}-head` : "lc-ready-head")
  }

  const skip = () => {
    if (!derived) return
    morph(() => {
      setOpen(null)
      chat.skipRest(derived.asked.filter((f) => !(f.id in chat.answers)))
    })
    focusHead("lc-ready-head")
  }

  const startCreate = () => {
    if (!derived || !rec) return
    morph(() => {
      setOpen(null)
      void create.start(derived.effective, rec.id)
    })
    focusHead("lc-ready-head")
  }

  const readyMode = active === "settings" ? "settings" : lastRun && lastRun.status !== "failed" ? "create" : lastRun && !open ? "create" : active === "ready" ? "card" : "line"

  return (
    <div className="relative flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <FlowTopBar title={t`Add Book`} />
      <FileDropOverlay overlay={flow.overlay} dropLabel={<Trans>Drop PDF here</Trans>} errorLabel={<Trans>Only PDF files are supported</Trans>} accent="blue" />
      <input ref={flow.inputRef} type="file" accept="application/pdf" className="hidden" onChange={flow.onInputChange} />
      <DotGrid>
        <div className="absolute left-1/2 top-[-160px] h-[420px] w-[900px] -translate-x-1/2 rounded-full bg-brand-300/20 blur-3xl motion-reduce:hidden" />
      </DotGrid>

      <div ref={scroller} className="relative flex-1 overflow-y-auto overflow-x-hidden">
        <div role="log" aria-label={t`Conversation with the ADT Assistant`} className="mx-auto flex w-full max-w-[1180px] flex-col gap-4 px-8 pb-10 pt-8">
          <div id="lc-at-book" className="scroll-mt-6">
            <BookSurface
              flow={flow}
              validFile={validFile}
              rejected={!!rejectedAt && !validFile}
              run={run}
              failure={failures[attempt]}
              done={!!rec}
              expanded={active === "book"}
              frozen={create.locked}
              onOpen={() => openSurface("book", "lc-book-head")}
              onCollapse={collapse}
              onRetry={() => morph(() => setAttempt((a) => a + 1))}
              onManual={manual}
            />
          </div>

          {rec && derived && flow.file && (
            <>
              <div id="lc-at-found" className="scroll-mt-6">
                <FoundSurface rec={rec} derived={derived} file={flow.file} expanded={active === "found"} onOpen={() => openSurface("found", "lc-found-head")} onCollapse={collapse} />
              </div>
              {derived.asked.map((fact, i) => {
                const shown = derived.asked.indexOf(pending ?? derived.asked[derived.asked.length - 1]!) >= i || !pending
                if (!shown) return null
                return (
                  <div key={fact.id} id={`lc-at-q-${fact.id}`} className="scroll-mt-6">
                    <QuestionSurface
                      rec={rec}
                      fact={fact}
                      answers={derived.current}
                      chosen={chat.answers[fact.id]}
                      index={i + 1}
                      total={derived.asked.length}
                      expanded={active === `q-${fact.id}`}
                      frozen={create.locked}
                      file={flow.file!}
                      onPick={(v) => onPick(fact.id, v)}
                      onOpen={() => openSurface(`q-${fact.id}`, `lc-q-${fact.id}-head`)}
                      onCollapse={collapse}
                    />
                  </div>
                )
              })}
              {!pending && (
                <div id={`lc-at-${readyMode === "settings" ? "settings" : lastRun ? "create" : "ready"}`} className="scroll-mt-6">
                  <ReadySurface
                    rec={rec}
                    derived={derived}
                    file={flow.file}
                    numPages={flow.pageCount}
                    mode={readyMode}
                    run={lastRun}
                    asked={derived.asked.length}
                    onChange={(id, v) => {
                      chat.override(id, v)
                      setAnnounce(say(id, v))
                    }}
                    onSettings={(o) => {
                      morph(() => setOpen(o ? "settings" : null))
                      focusHead("lc-ready-head")
                    }}
                    onCreate={startCreate}
                    onRetry={startCreate}
                    onRename={() => {
                      morph(() => setOpen("ready"))
                      window.setTimeout(() => (document.getElementById(NAME_INPUT) as HTMLInputElement | null)?.select(), AFTER_MORPH_MS)
                    }}
                    onOpenBook={create.open}
                    onAllSettings={manual}
                  />
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {!create.locked && (
        <div className="relative mx-auto flex w-full max-w-[1180px] justify-center gap-2 px-8 pb-5 pt-2">
          {pending && active.startsWith("q-") && (
            <ComposerReply onClick={skip} icon={<FastForward className="size-4" />} accent>
              <Trans>Skip to settings</Trans>
            </ComposerReply>
          )}
          <ComposerReply onClick={manual} icon={<Wrench className="size-4" />}>
            <Trans>Set it up myself</Trans>
          </ComposerReply>
        </div>
      )}
      <span role="status" className="sr-only">
        {announce}
      </span>
    </div>
  )
}
