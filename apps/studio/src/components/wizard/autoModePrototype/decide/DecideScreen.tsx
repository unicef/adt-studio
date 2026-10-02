import { useState } from "react"
import { useStore } from "@tanstack/react-form"
import { Trans, useLingui } from "@lingui/react/macro"
import { Sparkles } from "lucide-react"
import { useWizardForm } from "@/components/wizard/wizardForm"
import { cn } from "@/lib/utils"
import { LabToggle } from "../labControls"
import { useBookPages } from "../loader/useBookPages"
import { IntroThread } from "./intro/IntroThread"
import { SEEN_KEY, resetFirstTime, type IntroCopy } from "./intro/parts"
import { useLookQuestion } from "./questions"
import { PreviewChoice } from "./PreviewChoice"
import { useOwnPage } from "./ownPage"
import { useAiPicks } from "../review/setup"
import "../upload/upload.css"
import { BackButton, ENTER, PrimaryButton, ScreenShell } from "../ui"

type Visit = "first" | "returning"

const readVisit = (): Visit => (window.localStorage.getItem(SEEN_KEY) === "1" ? "returning" : "first")

/**
 * Step 4b (AI path, not sure). The assistant explains, in a few messages, that it set up the book but
 * couldn't settle how the pages should look and has two picks; then the options screen opens with
 * those picks highlighted. The intro is a chat thread that plays fully only the first time; after
 * that the messages cascade in at once (lab toggle "Thread plays as").
 */
export function DecideScreen({ onBack, onDone }: { onBack: () => void; onDone: (look: string) => void }) {
  const { t } = useLingui()
  const form = useWizardForm()
  const file = useStore(form.store, (s) => s.values.file)
  const { picks: aiPicks } = useAiPicks()
  const kind = aiPicks.kind === "picture" ? "picture" : "textbook"
  const book = useBookPages(file, { first: 2, count: 8, width: 640 })
  const own = useOwnPage(book.pages, aiPicks.pageGrouping === "spread")
  const question = useLookQuestion(kind)
  const label = useStore(form.store, (s) => s.values.label)
  const title = label ? label.charAt(0).toUpperCase() + label.slice(1) : t`your book`
  const [visit, setVisit] = useState<Visit>(readVisit)
  const [run, setRun] = useState(0)
  const [part, setPart] = useState<"intro" | "choose">("intro")
  const [value, setValue] = useState(question.candidates[0])
  const textbook = kind === "textbook"

  const hello = t`Hi! 👋 I just finished looking through ${title}.`
  const reason = textbook ? t`Your book has lots of exercises, but also big pictures with text on top, so two different looks could work.` : t`Your pages have the text printed right on the pictures, so two different looks could work.`
  const copy: IntroCopy = {
    hello,
    lines: [t`Good news — I've set up almost everything for you.`, t`There's just one thing I'd love your help with: how the pages should look.`, reason, t`I've picked my two favourites and highlighted them for you — have a look and choose the one you like.`],
  }

  const toIntro = () => {
    setVisit(readVisit())
    setRun((r) => r + 1)
    setPart("intro")
  }
  const changeVisit = (next: Visit) => {
    if (next === "first") resetFirstTime(SEEN_KEY)
    else window.localStorage.setItem(SEEN_KEY, "1")
    toIntro()
  }

  return (
    <ScreenShell
      overlay={
        <>
          <div className="fixed bottom-5 left-5 z-50 flex items-center gap-2">
            <LabToggle
              label={<Trans>Thread plays as</Trans>}
              value={visit}
              onChange={changeVisit}
              options={[
                { value: "first", label: <Trans>First time</Trans> },
                { value: "returning", label: <Trans>Returning</Trans> },
              ]}
            />
          </div>
        </>
      }
    >
      {part === "intro" ? (
        <div key={`intro-${kind}-${run}`} className="m-auto flex w-full justify-center py-10">
          <IntroThread copy={copy} onBack={onBack} onContinue={() => setPart("choose")} />
        </div>
      ) : (
        <div key={`choose-${run}`} className="relative m-auto flex w-full max-w-[1320px] flex-col gap-3 pb-[120px] pt-4">
          <div className={cn("flex flex-wrap items-center gap-x-4 gap-y-2", ENTER)}>
            <h1 className="text-[26px] font-bold leading-[1.1] tracking-[-0.025em]">
              <Trans>Pick how your pages should look</Trans>
            </h1>
            <span className="inline-flex items-center gap-2 rounded-full bg-brand-50 py-1 pl-1 pr-3 text-[13px] font-medium text-brand-800 ring-1 ring-brand-200">
              <span className="grid size-6 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-primary-foreground">
                <Sparkles className="size-3.5" />
              </span>
              <Trans>These are my two picks — try each one on a computer and a phone.</Trans>
            </span>
          </div>

          <div className={ENTER} style={{ animationDelay: "80ms" }}>
            <PreviewChoice question={question} page={own.src} spread={own.spread} value={value} onChange={setValue} />
          </div>

          <div className={cn("flex items-center justify-between gap-4 pt-1", ENTER)} style={{ animationDelay: "240ms" }}>
            <p className="text-[13px] text-muted-foreground">
              <Trans>You can change this later in the book settings.</Trans>
            </p>
            <div className="flex items-center gap-3">
              <BackButton onClick={toIntro} />
              <PrimaryButton onClick={() => onDone(value)}>
                <Trans>Continue</Trans>
              </PrimaryButton>
            </div>
          </div>

        </div>
      )}
    </ScreenShell>
  )
}
