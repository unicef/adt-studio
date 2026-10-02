import { useState } from "react"
import { useStore } from "@tanstack/react-form"
import { Trans } from "@lingui/react/macro"
import { RotateCcw } from "lucide-react"
import { useWizardForm } from "@/components/wizard/wizardForm"
import { cn } from "@/lib/utils"
import { LabToggle } from "../labControls"
import { AnswerChip, Heading, LiveStatus, Phrase, useLoaderRun, usePicks, type Outcome } from "./parts"
import { RealBook, useComments } from "./RealBook"
import { useBookPages } from "./useBookPages"
import { useAiPicks } from "../review/setup"
import "../upload/upload.css"
import { ENTER, PrimaryButton, ScreenShell } from "../ui"

const FIRST_PAGE = 2

/**
 * Step 3 (AI path) — the short wait (< 10 s) while the AI sets the book up. A realistic open book
 * made of the real PDF pages flips through in order while the AI "reads" and leaves friendly
 * margin notes; the picks resolve with their answers; then it hands off to the result.
 * Lab toggle "Outcome": Loop (default, repeats for review) · Success (to the result) · Needs you (to the
 * decide screen) · Error.
 */
export function LoaderScreen({ onDone, onUnsure, onStartOver }: { onDone: () => void; onUnsure: () => void; onStartOver: () => void }) {
  const form = useWizardForm()
  const file = useStore(form.store, (s) => s.values.file)
  const book = useBookPages(file, { first: FIRST_PAGE, count: 16, width: 560 })
  const comments = useComments()
  const [outcome, setOutcome] = useState<Outcome>("loop")
  const [run, setRun] = useState(0)
  const state = useLoaderRun(outcome, run, outcome === "unsure" ? onUnsure : onDone)
  const picks = usePicks(useAiPicks().picks)
  const done = state.finished && (outcome === "success" || outcome === "unsure")

  return (
    <ScreenShell
      backdrop={
          <div className={cn("absolute left-1/2 top-[36%] h-[460px] w-[900px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl transition-colors duration-700", state.failed ? "bg-muted/60" : "bg-brand-300/20")} />
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
                { value: "error", label: <Trans>Error</Trans> },
              ]}
            />
          </div>
        </>
      }
    >
      <div key={run} className="m-auto flex w-full flex-col items-center gap-10 pb-10 pt-6 text-center">
        <div className={ENTER}>
          <RealBook pages={book.pages} numPages={book.numPages} aspect={book.aspect} first={FIRST_PAGE} comments={comments} stopped={done} failed={state.failed} />
        </div>

        {state.failed ? (
          <div className="flex flex-col items-center gap-3 animate-[am-fade-up_0.4s_cubic-bezier(0.22,1,0.36,1)_both] motion-reduce:animate-none">
            <h1 className="text-[40px] font-bold leading-[1.05] tracking-[-0.03em]">
              <Trans>We couldn&apos;t read this book</Trans>
            </h1>
            <p className="max-w-[520px] text-[16px] leading-relaxed text-muted-foreground">
              <Trans>Something went wrong while the AI was looking at your book. Try again, or start over and choose the settings yourself.</Trans>
            </p>
            <div className="mt-4 flex items-center gap-3">
              <button type="button" onClick={onStartOver} className="inline-flex h-11 items-center gap-1.5 rounded-full bg-muted px-5 text-[14px] font-medium transition-[background-color,transform] duration-150 hover:bg-muted/70 active:scale-[0.97]">
                <Trans>Start over</Trans>
              </button>
              <PrimaryButton onClick={() => setRun((r) => r + 1)} icon={<RotateCcw className="size-4 transition-transform duration-300 group-hover:-rotate-45" />}>
                <Trans>Try again</Trans>
              </PrimaryButton>
            </div>
          </div>
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
            <button type="button" onClick={onStartOver} className={cn("mt-1 inline-flex items-center gap-1 rounded-md px-2 py-1 text-[13px] font-medium text-muted-foreground transition-[color,opacity] duration-300 hover:text-foreground", done && "pointer-events-none opacity-0", ENTER)} style={{ animationDelay: "400ms" }}>
              <Trans>Cancel</Trans>
            </button>
          </div>
        )}
      </div>
    </ScreenShell>
  )
}
