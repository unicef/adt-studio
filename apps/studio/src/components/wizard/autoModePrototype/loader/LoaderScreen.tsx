import { useState } from "react"
import { useStore } from "@tanstack/react-form"
import { Trans } from "@lingui/react/macro"
import { Hourglass } from "lucide-react"
import { useWizardForm } from "@/components/wizard/wizardForm"
import { Collapsible } from "@/components/ui/collapsible"
import { cn } from "@/lib/utils"
import { LabToggle } from "../labControls"
import { AnswerChip, Heading, LiveStatus, Phrase, useLoaderRun, usePicks, type Outcome } from "./parts"
import { RealBook, useComments } from "./RealBook"
import { useBookPages } from "./useBookPages"
import { useAiPicks } from "../review/setup"
import "../upload/upload.css"
import { ENTER, ScreenShell } from "../ui"
import { SetupError, type SetupErrorKind } from "../errors/SetupError"

const FIRST_PAGE = 2
// eslint-disable-next-line lingui/no-unlocalized-strings -- provider brand name, mock for the lab
const PROVIDER = "OpenAI"

/**
 * Step 3 (AI path) — the short wait (< 10 s) while the AI sets the book up. A realistic open book
 * made of the real PDF pages flips through in order while the AI "reads" and leaves friendly
 * margin notes; the picks resolve with their answers; then it hands off to the result.
 * Lab toggle "Outcome": Loop (default, repeats for review) · Success (to the result) · Needs you (to the
 * decide screen) · Slow (a calm "taking longer" note) · Error, with the error kind on its own toggle.
 * Every way out keeps the PDF: Cancel goes back to Choose, "Set it up myself" opens the manual setup.
 */
export function LoaderScreen({ onDone, onUnsure, onStartOver, onManual }: { onDone: () => void; onUnsure: () => void; onStartOver: () => void; onManual: () => void }) {
  const form = useWizardForm()
  const file = useStore(form.store, (s) => s.values.file)
  const scope = useStore(form.store, (s) => s.values.scope)
  const startPage = parseInt(useStore(form.store, (s) => s.values.startPage)) || 1
  const endPage = parseInt(useStore(form.store, (s) => s.values.endPage)) || 0
  const first = scope === "range" ? startPage : FIRST_PAGE
  const count = scope === "range" && endPage ? Math.max(1, Math.min(16, endPage - first + 1)) : 16
  const book = useBookPages(file, { first, count, width: 560 })
  const comments = useComments()
  const [outcome, setOutcome] = useState<Outcome>("loop")
  const [errorKind, setErrorKind] = useState<SetupErrorKind>("unknown")
  const [run, setRun] = useState(0)
  const state = useLoaderRun(outcome, run, outcome === "unsure" ? onUnsure : onDone)
  const picks = usePicks(useAiPicks().picks)
  const done = state.finished && (outcome === "success" || outcome === "unsure")

  return (
    <ScreenShell
      backdrop={
          <div className={cn("absolute left-1/2 top-[36%] h-[460px] w-[900px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl transition-colors duration-700 motion-reduce:hidden", state.failed ? "bg-muted/60" : "bg-brand-300/20")} />
      }
      overlay={
        <>
          <LiveStatus picks={picks} resolved={state.failed ? 0 : state.resolved} />
          <div className="fixed bottom-5 left-5 z-50 flex items-center gap-2">
            <LabToggle
              label={<Trans>Outcome</Trans>}
              value={outcome}
              onChange={(value) => {
                setOutcome(value)
                setRun((r) => r + 1)
              }}
              options={[
                { value: "loop", label: <Trans>Loop</Trans> },
                { value: "success", label: <Trans>Success</Trans> },
                { value: "unsure", label: <Trans>Needs you</Trans> },
                { value: "slow", label: <Trans>Slow</Trans> },
                { value: "error", label: <Trans>Error</Trans> },
              ]}
            />
            {outcome === "error" && (
              <LabToggle
                label={<Trans>Error</Trans>}
                value={errorKind}
                onChange={(value) => {
                  setErrorKind(value)
                  setRun((r) => r + 1)
                }}
                options={[
                  { value: "auth", label: <Trans>API key</Trans> },
                  { value: "quota", label: <Trans>Limit</Trans> },
                  { value: "offline", label: <Trans>Offline</Trans> },
                  { value: "unknown", label: <Trans>Other</Trans> },
                ]}
              />
            )}
          </div>
        </>
      }
    >
      <div key={run} className="m-auto flex w-full flex-col items-center gap-10 pb-10 pt-6 text-center">
        <div className={ENTER}>
          <RealBook pages={book.pages} numPages={book.numPages} aspect={book.aspect} first={first} comments={comments} stopped={done} failed={state.failed} />
        </div>

        <div className="flex min-h-[240px] w-full flex-col items-center">
          {state.failed ? (
            <SetupError kind={errorKind} provider={PROVIDER} onRetry={() => setRun((r) => r + 1)} onManual={onManual} />
          ) : (
            <div className="flex flex-col items-center gap-5">
              <div className={cn("flex flex-col items-center gap-3", ENTER)} style={{ animationDelay: "80ms" }}>
                <div className="grid h-[48px] place-items-center">
                  <div aria-hidden={state.finished} className={cn("col-start-1 row-start-1 transition-[opacity,filter] duration-300", state.finished ? "opacity-0 blur-[3px]" : "opacity-100")}>
                    <Heading finished={false} />
                  </div>
                  <div aria-hidden={!state.finished} className={cn("col-start-1 row-start-1 transition-[opacity,filter] duration-500", state.finished ? "opacity-100" : "opacity-0 blur-[3px]")}>
                    <Heading finished />
                  </div>
                </div>
                <Phrase key={`${run}-${state.resolved === 0}`} finished={state.finished} />
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2.5">
                {picks.map((pick, i) => (
                  <AnswerChip key={pick.key} pick={pick} done={state.resolved > i} index={i} />
                ))}
              </div>
              <div className="flex flex-col items-center">
                <Collapsible shown={state.slow}>
                  <p inert={!state.slow} className="mb-3 inline-flex items-center gap-2 rounded-full bg-muted px-3.5 py-1.5 text-[13px] text-muted-foreground">
                    <Hourglass className="size-3.5" />
                    <Trans>This is taking longer than usual.</Trans>
                    <button type="button" onClick={onManual} className="font-semibold text-brand-700 underline decoration-brand-300 underline-offset-4 transition-colors hover:text-brand-800">
                      <Trans>Set it up myself</Trans>
                    </button>
                  </p>
                </Collapsible>
                <button type="button" onClick={onStartOver} className={cn("mt-1 inline-flex items-center gap-1 rounded-md px-2 py-1 text-[13px] font-medium text-muted-foreground transition-[color,opacity] duration-300 hover:text-foreground", done && "pointer-events-none opacity-0", ENTER)} style={{ animationDelay: "400ms" }}>
                  <Trans>Cancel</Trans>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </ScreenShell>
  )
}
