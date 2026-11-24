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
import "../../../core/flow.css"
import { useUploadFlow } from "../../../start/upload/useUploadFlow"
import { Avatar } from "../../decide/intro/parts"
import { AssistantRow, Folded, TypingRow, UserRow } from "./bubbles"
import { Composer, ComposerReply } from "./Composer"
import { NAME_INPUT } from "./Create"
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

  // A new PDF starts a new conversation about it.
  useEffect(() => {
    setAttempt(0)
    setFailures({})
    setUnfolded(new Set())
    chat.reset()
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

  const { messages, summaries } = useThread({
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
  const reveal = useReveal(messages)
  const shown = messages.slice(0, reveal.visible)
  const groups = groupBySteps(shown)
  const engineBusy = validFile && run.status === "running"
  const waiting = !reveal.typing && reveal.visible === messages.length && engineBusy
  const settingsShown = shown.some((m) => m.step === "ready")
  const canSkip = !!rec && !settingsShown && !create.locked

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

  return (
    <div className="relative flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <FlowTopBar title={t`Add Book`} />
      <FileDropOverlay overlay={flow.overlay} dropLabel={<Trans>Drop PDF here</Trans>} errorLabel={<Trans>Only PDF files are supported</Trans>} accent="blue" />
      <input ref={flow.inputRef} type="file" accept="application/pdf" className="hidden" onChange={flow.onInputChange} />
      <DotGrid>
        <div className="absolute left-1/2 top-[-120px] h-[380px] w-[760px] -translate-x-1/2 rounded-full bg-brand-300/20 blur-3xl motion-reduce:hidden" />
      </DotGrid>

      <div
        ref={scroller}
        onScroll={(e) => {
          const box = e.currentTarget
          nearBottom.current = box.scrollHeight - box.scrollTop - box.clientHeight < NEAR_BOTTOM
        }}
        className="relative flex-1 overflow-y-auto overflow-x-hidden"
      >
        <div className={cn("mx-auto flex w-full flex-col px-4 pb-8 pt-8 sm:px-6 sm:pt-12", living ? "max-w-[960px]" : "max-w-[760px]")}>
          {!validFile && (
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
                const gap = i === 0 ? "" : g.messages[i - 1]!.from === m.from ? (living ? "mt-2.5" : "mt-1.5") : living ? "mt-6" : "mt-4"
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
              const open = current || !summary || unfolded.has(g.step)
              return (
                <section key={g.step} className={gi === 0 ? "" : current ? (living ? "mt-9" : "mt-6") : living ? "mt-3" : "mt-2"}>
                  {!current && summary && <Folded summary={summary} open={open} locked={create.locked} onToggle={() => setUnfolded((u) => (u.has(g.step) ? new Set([...u].filter((s) => s !== g.step)) : new Set(u).add(g.step)))} />}
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
            <div className={cn(shown[shown.length - 1]?.from === "ai" ? (living ? "mt-2.5" : "mt-1.5") : living ? "mt-7" : "mt-5")}>
              <TypingRow />
            </div>
          )}
        </div>
      </div>

      {!create.locked && (
        <div ref={composer}>
          <Composer flow={flow} replies={replies} />
        </div>
      )}
      <span role="status" className="sr-only">
        {waiting ? <Trans>The ADT Assistant is reading your book…</Trans> : announce}
      </span>
    </div>
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
