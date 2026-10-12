import { useState } from "react"
import { useStore } from "@tanstack/react-form"
import { Trans, useLingui } from "@lingui/react/macro"
import { Sparkles } from "lucide-react"
import { useWizardForm } from "@/components/wizard/core/wizardForm"
import { cn } from "@/lib/utils"
import { useBookPages } from "../loader/useBookPages"
import { IntroThread } from "./intro/IntroThread"
import type { IntroCopy } from "./intro/parts"
import { useLookQuestion } from "./questions"
import { PreviewChoice } from "./PreviewChoice"
import { useOwnPage } from "./ownPage"
import { useAiPicks } from "../review/setup"
import "../../core/flow.css"
import { BackButton, ENTER, PrimaryButton, ScreenShell } from "../../core/ui"

/**
 * Decide (AI path, only when it isn't sure). The recommender left Render Strategy between its choice and an
 * alternative; the assistant says so in a few messages (the doubt in the recommender's own words,
 * already in the user's language), then the options screen opens with those two highlighted. The intro is a chat thread that plays fully only the first time; after
 * that the messages cascade in at once.
 */
export function DecideScreen({ onBack, onDone }: { onBack: () => void; onDone: (look: string) => void }) {
  const { t } = useLingui()
  const form = useWizardForm()
  const file = useStore(form.store, (s) => s.values.file)
  const { picks: aiPicks } = useAiPicks()
  const look = aiPicks.decisions.renderStrategy
  const book = useBookPages(file, { first: 2, count: 8, width: 640 })
  const own = useOwnPage(book.pages, aiPicks.pageGrouping === "spread")
  const question = useLookQuestion(aiPicks.renderStrategy, look.alternative, aiPicks.preset)
  const label = useStore(form.store, (s) => s.values.label)
  const title = label ? label.charAt(0).toUpperCase() + label.slice(1) : t`your book`
  const [part, setPart] = useState<"intro" | "choose">("intro")
  const [value, setValue] = useState(question.candidates[0])

  const hello = t`Hi! 👋 I just finished looking through ${title}.`
  const reason = look.ambiguityReason ?? t`Two different looks could work for your pages.`
  const copy: IntroCopy = {
    hello,
    lines: [t`Good news — I've set up almost everything for you.`, t`There's just one thing I'd love your help with: how the pages should look.`, reason, t`I've picked my two favourites and highlighted them for you — have a look and choose the one you like.`],
  }

  const toIntro = () => setPart("intro")

  return (
    <ScreenShell>
      {part === "intro" ? (
        <div key="intro" className="m-auto flex w-full justify-center py-10">
          <IntroThread copy={copy} onBack={onBack} onContinue={() => setPart("choose")} />
        </div>
      ) : (
        <div key="choose" className="relative m-auto flex w-full max-w-[1320px] flex-col gap-3 pb-[120px] pt-4">
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
