import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { flushSync } from "react-dom"
import { Trans, useLingui } from "@lingui/react/macro"
import { FastForward, Wrench } from "lucide-react"
import type { SetupBookFactId, SetupSettingId } from "@adt/types"
import { FileDropOverlay } from "@/components/ui/file-drop-overlay"
import { FlowTopBar } from "@/components/FlowTopBar"
import { useReducedEffects } from "@/lib/effects"
import { cn } from "@/lib/utils"
import type { SetupFailure } from "../../recommendation/client"
import { applySettings, settingsChangedBy, settingsFor } from "../../engine/answers"
import { useEngineRun } from "../../engine/useEngineRun"
import { useWizardForm } from "../../../core/wizardForm"
import { DotGrid } from "../../../core/ui"
import { AmbientLayer, ambientPhase } from "../livechat/ideas/ambient/AmbientLayer"
import "../../../core/flow.css"
import { useUploadFlow } from "../../../start/upload/useUploadFlow"
import { Avatar } from "../../decide/intro/parts"
import { FoldedStep } from "../livechat/ideas/expand/FoldedStep"
import { Island } from "../livechat/ideas/expand/Island"
import { CANVAS_WIDTH, CanvasContext } from "../livechat/ideas/expand/SideCanvas"
import { ENDS_IN_PLACE, FinishContext } from "../livechat/ideas/finish/context"
import { AssistantRow, Folded, Orb, TypingRow, UserRow } from "./bubbles"
import { Composer, ComposerReply } from "./Composer"
import { NAME_INPUT } from "./Create"
import { useIdea } from "./ideas"
import { useHoldAtFound, useLabDrive } from "./labDrive"
import { useLiving } from "./look"
import { useAnswers, type SettingValue } from "./useAnswers"
import { useCreateRun } from "./useCreateRun"
import { useReveal } from "./useReveal"
import { useThread, type Message } from "./useThread"
import { SETTING_LABEL, valueTitle } from "./words"

const NEAR_BOTTOM = 160

/**
 * The Add Book flow as one conversation with the ADT Assistant: the composer takes the PDF, the
 * assistant says what it's doing while the engine runs, what it found (with the pages that show it),
 * asks its questions one at a time, then shows the setup as a card, asks for a name and creates the
 * book, all in the thread. "Set it up myself" is always in the composer.
 */
export function ChatThread({ onManual }: { onManual: () => void }) {
  const { t, i18n } = useLingui()
  const form = useWizardForm()
  const flow = useUploadFlow()
  const validFile = !!flow.file && flow.pageCount > 0 && !flow.error
  const [attempt, setAttempt] = useState(0)
  const [failures, setFailures] = useState<Record<number, SetupFailure>>({})
  const [rejectedAt, setRejectedAt] = useState(0)
  const [unfolded, setUnfolded] = useState<Set<string>>(() => new Set())
  const [announce, setAnnounce] = useState("")
  const run = useEngineRun(validFile ? flow.file : null, attempt)
  const rec = run.status === "done" ? run.rec : null
  const chat = useAnswers(rec)
  const create = useCreateRun()
  const scroller = useRef<HTMLDivElement>(null)
  const composer = useRef<HTMLDivElement>(null)
  const acted = useRef(false)
  const reduced = useReducedEffects()
  const living = useLiving()
  // Lab ideas from the reference board (Living chat only; "now" everywhere else).
  const ideaExpand = useIdea("expand")
  const ideaFinish = useIdea("finish")
  const expandIdea = living ? ideaExpand : "now"
  const finishIdea = living ? ideaFinish : "now"
  const [canvasEl, setCanvasEl] = useState<HTMLDivElement | null>(null)
  const [canvasOpen, setCanvasOpen] = useState(false)

  // A new PDF starts a new conversation about it.
  useEffect(() => {
    setAttempt(0)
    setFailures({})
    setUnfolded(new Set())
    chat.reset()
    create.reset()
  }, [flow.fileKey])
  useEffect(() => {
    if (run.status === "failed") setFailures((f) => ({ ...f, [attempt]: run.failure }))
  }, [run.status])
  useEffect(() => {
    if (flow.rejectedAt) setRejectedAt(flow.rejectedAt)
  }, [flow.rejectedAt])
  useEffect(() => {
    if (validFile) setRejectedAt(0)
  }, [validFile])

  const say = (id: SetupSettingId, value: SettingValue | undefined) => {
    const title = valueTitle(id, value)
    return `${i18n._(SETTING_LABEL[id])}: ${title ? i18n._(title) : String(value)}`
  }

  const manual = () => {
    if (chat.derived) applySettings(form, chat.derived.effective)
    onManual()
  }

  const onAnswer = (fact: SetupBookFactId, value: string) => {
    acted.current = true
    const before = chat.answers[fact]
    if (before && before !== value && chat.derived && rec) {
      const then = settingsFor(rec, { ...chat.derived.current, [fact]: value })
      const changed = settingsChangedBy(rec, chat.derived.current, fact, value).map((id) => say(id, then[id]?.value))
      setAnnounce(changed.length ? t`Answer changed. Now ${changed.join(", ")}.` : t`Answer changed. No setting changes.`)
    }
    chat.answer(fact, value)
  }

  const onSetting = (id: SetupSettingId, value: SettingValue) => {
    chat.override(id, value)
    setAnnounce(say(id, value))
  }

  const thread = useThread({
    flow,
    validFile,
    rejectedAt,
    attempt,
    failures,
    run,
    rec,
    chat,
    create,
    onRetry: () => {
      acted.current = true
      setAttempt((a) => a + 1)
    },
    onManual: manual,
    onAnswer,
    onSetting,
    onCreate: () => {
      if (!chat.derived || !rec) return
      acted.current = true
      void create.start(chat.derived.effective, rec.id)
    },
    onRename: () => {
      flushSync(() => setUnfolded((u) => new Set(u).add("ready")))
      const input = document.getElementById(NAME_INPUT) as HTMLInputElement | null
      input?.scrollIntoView({ block: "center", behavior: "smooth" })
      input?.focus({ preventScroll: true })
      input?.select()
    },
  })
  const { summaries } = thread
  // f26 / f29: the creating message becomes the end itself, so the separate "ready" message is left out.
  const messages = useHoldAtFound(ENDS_IN_PLACE.includes(finishIdea) ? thread.messages.filter((m) => !m.id.startsWith("done-")) : thread.messages)
  const reveal = useReveal(messages)
  const shown = messages.slice(0, reveal.visible)
  const groups = groupBySteps(shown)
  const engineBusy = validFile && run.status === "running"
  const waiting = !reveal.typing && reveal.visible === messages.length && engineBusy
  const settingsShown = shown.some((m) => m.step === "ready")
  // b11: the step that was current until this render folds with its receipt animation.
  const lastStep = groups[groups.length - 1]?.step
  const prevLastStep = useRef(lastStep)
  const justFolded = prevLastStep.current !== lastStep ? prevLastStep.current : undefined
  useEffect(() => {
    prevLastStep.current = lastStep
  }, [lastStep])
  // a2: the step you just answered stays open until your reply has landed, then folds.
  const entranceIdea = useIdea("entrance")
  const [lingering, setLingering] = useState<string | undefined>()
  useEffect(() => {
    if (!living || entranceIdea !== "a2" || !justFolded) return
    setLingering(justFolded)
    const id = window.setTimeout(() => setLingering(undefined), 900)
    return () => window.clearTimeout(id)
  }, [lastStep])
  const canSkip = !!rec && !settingsShown && !create.locked
  // Dev lab only (no-op elsewhere): reports the step and plays the lab's jumps.
  useLabDrive({ validFile, failed: !!failures[attempt], rec, chat, create, lastStep, flush: reveal.flush })

  useEffect(() => {
    if (settingsShown) reveal.markSeen()
  }, [settingsShown])

  // Keep the newest message in view while the reader is at the bottom (or just acted); if it's
  // taller than the view, stop at its top so it reads from the start.
  const last = shown[shown.length - 1]
  const nearBottom = useRef(true)
  useLayoutEffect(() => {
    const box = scroller.current
    if (!box || !last) return
    if (!nearBottom.current && !acted.current) return
    const el = document.getElementById(`msg-${last.id}`)
    const bottom = box.scrollHeight - box.clientHeight
    const target = el && el.offsetHeight > box.clientHeight - 80 ? el.offsetTop - 24 : bottom
    box.scrollTo({ top: Math.min(bottom, target), behavior: reduced ? "auto" : "smooth" })
  }, [last?.id, reveal.typing, waiting])

  // Move focus to what the user has to do next, but only when they just acted on the thread (never
  // pull it away from something they're in the middle of, like the page range).
  const focusedFor = useRef<string | null>(null)
  useEffect(() => {
    if (!last?.focus || focusedFor.current === last.id || !acted.current) return
    const active = document.activeElement
    const free = !active || active === document.body || composer.current?.contains(active) || !!active.closest("[data-handoff]") || !active.isConnected
    if (!free) return
    focusedFor.current = last.id
    const id = window.setTimeout(() => document.querySelector<HTMLElement>(last.focus!)?.focus({ preventScroll: true }), 380)
    return () => window.clearTimeout(id)
  }, [last?.id])

  const skip = () => {
    acted.current = true
    if (rec && chat.derived) chat.skipRest(chat.derived.asked.filter((f) => !(f.id in chat.answers)))
    reveal.flush()
  }

  const replies = (
    <>
      {canSkip && (
        <ComposerReply onClick={skip} icon={<FastForward className="size-4" />} accent>
          <Trans>Skip to settings</Trans>
        </ComposerReply>
      )}
      {!create.locked && (
        <ComposerReply onClick={manual} icon={<Wrench className="size-4" />}>
          <Trans>Set it up myself</Trans>
        </ComposerReply>
      )}
    </>
  )

  // b9: the side canvas takes this much of the thread's right side while it's open.
  const shift = expandIdea === "b9" && canvasOpen ? { paddingRight: CANVAS_WIDTH + 24 } : undefined
  const asked = chat.derived?.asked ?? []
  const askIndex = last?.step.startsWith("q-") ? asked.findIndex((f) => `q-${f.id}` === last.step) : -1

  return (
    <FinishContext.Provider value={{ onOpen: create.open }}>
    <CanvasContext.Provider value={{ el: canvasEl, setOpen: setCanvasOpen }}>
    <div className={cn("relative flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-background", living && "lc-root")}>
      <FlowTopBar title={t`Add Book`} />
      <FileDropOverlay overlay={flow.overlay} dropLabel={<Trans>Drop PDF here</Trans>} errorLabel={<Trans>Only PDF files are supported</Trans>} accent="blue" />
      <input ref={flow.inputRef} type="file" accept="application/pdf" className="hidden" onChange={flow.onInputChange} />
      {!living && (
        <DotGrid>
          <div className="absolute left-1/2 top-[-120px] h-[380px] w-[760px] -translate-x-1/2 rounded-full bg-brand-300/20 blur-3xl motion-reduce:hidden" />
        </DotGrid>
      )}
      <AmbientLayer phase={ambientPhase(engineBusy, last?.id)} />

      <div
        ref={scroller}
        onScroll={(e) => {
          const box = e.currentTarget
          nearBottom.current = box.scrollHeight - box.scrollTop - box.clientHeight < NEAR_BOTTOM
        }}
        className={cn("relative flex-1 overflow-y-auto overflow-x-hidden", expandIdea === "b9" && "ix-shift")}
        style={shift}
      >
        <div className={cn("mx-auto flex w-full flex-col px-4 pb-8 pt-8 sm:px-6 sm:pt-12", "max-w-[760px]", expandIdea === "b7" && validFile && "sm:pt-[104px]")}>
          {!validFile && living && (
            <header className="mb-10 flex flex-col items-start gap-5 animate-[am-fade-up_0.5s_cubic-bezier(0.22,1,0.36,1)_both] motion-reduce:animate-none">
              <span className="lc-avatar flex">
                <Orb size={40} />
              </span>
              <div className="flex flex-col gap-2">
                <h1 className="text-[30px] font-semibold leading-[1.1] tracking-[-0.025em] sm:text-[34px]">
                  <Trans>
                    Let&apos;s set up your <span className="text-brand-700">book</span>, together.
                  </Trans>
                </h1>
                <p className="max-w-[520px] text-[15.5px] leading-relaxed text-muted-foreground">
                  <Trans>Send a PDF, answer a question or two, done.</Trans>
                </p>
              </div>
            </header>
          )}
          {!validFile && !living && (
            <header className="mb-8 flex flex-col items-start gap-4 animate-[am-fade-up_0.5s_cubic-bezier(0.22,1,0.36,1)_both] motion-reduce:animate-none">
              <span className={living ? "lc-avatar" : undefined}>
                <Avatar size="lg" />
              </span>
              <div className="flex flex-col gap-2">
                <h1 className="text-[34px] font-bold leading-[1.02] tracking-[-0.035em] sm:text-[44px]">
                  <Trans>
                    Let&apos;s set up your <span className="bg-gradient-to-br from-brand-400 to-brand-700 bg-clip-text text-transparent">book</span>, together.
                  </Trans>
                </h1>
                <p className="max-w-[520px] text-[15.5px] leading-relaxed text-muted-foreground">
                  <Trans>Send a PDF, answer a question or two, done.</Trans>
                </p>
              </div>
            </header>
          )}

          <div role="log" aria-label={t`Conversation with the ADT Assistant`} aria-relevant="additions" className="flex flex-col">
            {groups.map((g, gi) => {
              const current = gi === groups.length - 1
              const summary = summaries[g.step]
              const body = g.messages.map((m, i) => {
                const next = g.messages[i + 1]
                const lastShown = current && i === g.messages.length - 1
                const tail = m.from === "ai" && (!next || next.from !== "ai") && !(lastShown && reveal.typing)
                const gap = i === 0 ? "" : g.messages[i - 1]!.from === m.from ? (living ? "mt-2" : "mt-1.5") : living ? "mt-5" : "mt-4"
                return (
                  <div key={m.id} id={`msg-${m.id}`} data-handoff={m.from === "ai" && m.focus ? "" : undefined} className={gap}>
                    {m.from === "ai" ? (
                      <AssistantRow tail={tail} card={m.card}>
                        {m.body}
                      </AssistantRow>
                    ) : (
                      <UserRow plain={m.plain}>{m.body}</UserRow>
                    )}
                  </div>
                )
              })
              const open = current || !summary || unfolded.has(g.step) || lingering === g.step
              const toggleStep = () => setUnfolded((u) => (u.has(g.step) ? new Set([...u].filter((s) => s !== g.step)) : new Set(u).add(g.step)))
              if (!current && summary && (expandIdea === "b6" || expandIdea === "b8" || expandIdea === "b11"))
                return (
                  <section key={g.step} className={gi === 0 ? "" : "mt-3"}>
                    <FoldedStep idea={expandIdea} step={g.step} summary={summary} open={open} locked={create.locked} onToggle={toggleStep} body={body} fresh={justFolded === g.step} />
                  </section>
                )
              return (
                <section key={g.step} className={gi === 0 ? "" : current ? (living ? "mt-7" : "mt-6") : living ? "mt-0.5" : "mt-2"}>
                  {!current && summary && <Folded summary={summary} open={open} locked={create.locked} onToggle={toggleStep} />}
                  {living && !current && summary ? (
                    <div className="lc-fold" data-open={open} inert={!open}>
                      <div>
                        <div className="mb-5 mt-4">{body}</div>
                      </div>
                    </div>
                  ) : (
                    open && <div className={!current && summary ? "mb-4 mt-3" : ""}>{body}</div>
                  )}
                </section>
              )
            })}
          </div>
          {reveal.typing && (
            <div className={cn(shown[shown.length - 1]?.from === "ai" ? (living ? "mt-2" : "mt-1.5") : living ? "mt-5" : "mt-5")}>
              <TypingRow />
            </div>
          )}
        </div>
      </div>

      {!create.locked && (
        <div ref={composer} className={expandIdea === "b9" ? "ix-shift" : undefined} style={shift}>
          <Composer flow={flow} replies={replies} />
        </div>
      )}
      {expandIdea === "b9" && <div ref={setCanvasEl} className="ix-canvas-slot pointer-events-none absolute right-4 top-[76px] z-20 flex" style={{ width: CANVAS_WIDTH }} />}
      {expandIdea === "b7" && validFile && (
        <Island
          engine={run.status}
          step={reveal.typing ? undefined : last?.step}
          messageId={last?.id}
          ask={askIndex >= 0 ? { index: askIndex + 1, total: asked.length } : null}
          create={create.runs[create.runs.length - 1]}
          onOpen={create.open}
        />
      )}
      <span role="status" className="sr-only">
        {waiting ? <Trans>The ADT Assistant is reading your book…</Trans> : announce}
      </span>
    </div>
    </CanvasContext.Provider>
    </FinishContext.Provider>
  )
}

/** Consecutive messages of the same step, in order. */
function groupBySteps(messages: Message[]) {
  const out: { step: string; messages: Message[] }[] = []
  for (const m of messages) {
    const last = out[out.length - 1]
    if (last?.step === m.step) last.messages.push(m)
    else out.push({ step: m.step, messages: [m] })
  }
  return out
}
