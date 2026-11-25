import { Trans } from "@lingui/react/macro"
import { Sparkles, Wrench } from "lucide-react"
import type { SetupBookFactId, SetupRecommendation, SetupSettingId } from "@adt/types"
import { NameField, useCreate } from "../../review/parts"
import { PrimaryButton } from "../../../core/ui"
import { SettingsSentence } from "../livechat/ideas/evidence/SettingsSentence"
import { LC_PRIMARY } from "../chat/Create"
import { SettingsCard } from "../chat/SettingsCard"
import type { Answers, SettingValue } from "../chat/useAnswers"
import { useGuidedIdea } from "./ideas"
import { Questions } from "./Questions"

type Props = {
  rec: SetupRecommendation
  chat: Answers
  file: File | null | undefined
  pageCount: number
  locked: boolean
  onAnswer: (fact: SetupBookFactId, value: string) => void
  onSetting: (id: SetupSettingId, value: SettingValue) => void
  onCreate: () => void
  onManual: () => void
}

/**
 * Under the Check bubble: the questions (only when the engine asks), then one card with the setup in
 * plain words (Change opens every setting) and the book's name, and Create in a footer that sticks
 * to the bottom of the view, so it stays in reach when the questions make the step taller than the screen. "Set it up myself"
 * opens the step-by-step wizard with all of this kept.
 */
export function CheckPanel({ rec, chat, file, pageCount, locked, onAnswer, onSetting, onCreate, onManual }: Props) {
  const derived = chat.derived!
  const evidence = useGuidedIdea("evidence")
  const create = useCreate(onCreate)
  return (
    <div className="flex flex-col gap-4">
      <Questions rec={rec} chat={chat} file={file} frozen={locked} onAnswer={onAnswer} />
      <div inert={locked} className="lc-surface flex flex-col gap-3.5 p-4 sm:px-5">
        {evidence === "e24" ? (
          <SettingsSentence rec={rec} derived={derived} onChange={onSetting} frozen={locked} onAllSettings={onManual} />
        ) : (
          <SettingsCard rec={rec} derived={derived} onChange={onSetting} frozen={locked} numPages={pageCount} file={file} onAllSettings={onManual} />
        )}
        <div className="h-px bg-border/70" />
        <NameField />
      </div>
      {/* Create stays in reach: the footer sticks to the bottom of the view while the step is taller than the screen. */}
      <div className="gd-foot sticky bottom-0 z-10 -mx-2 -mt-1 flex flex-wrap items-center justify-between gap-3 px-2 pb-4 pt-5">
        <button type="button" onClick={onManual} className="lc-link -ml-2 inline-flex min-h-10 items-center gap-1.5 px-3 text-[14px] font-medium">
          <Wrench className="size-4" />
          <Trans>Set it up myself</Trans>
        </button>
        <PrimaryButton onClick={create} disabled={locked} icon={<Sparkles className="size-4" />} className={LC_PRIMARY}>
          <Trans>Create book</Trans>
        </PrimaryButton>
      </div>
    </div>
  )
}
