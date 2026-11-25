import { Trans } from "@lingui/react/macro"
import { Sparkles, Wrench } from "lucide-react"
import { cn } from "@/lib/utils"
import type { SetupBookFactId, SetupRecommendation, SetupSettingId } from "@adt/types"
import { NameField, useCreate } from "../../review/parts"
import { PrimaryButton } from "../../../core/ui"
import { SettingsSentence } from "../livechat/ideas/evidence/SettingsSentence"
import { LC_PRIMARY } from "../chat/Create"
import { SettingsCard } from "../chat/SettingsCard"
import type { Answers, SettingValue } from "../chat/useAnswers"
import { useGuidedIdea } from "./ideas"
import { Questions } from "./Questions"
import { SureFacts } from "./SureFacts"

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

/** Under the Check bubble: the questions (only when the engine asks), then what it's sure of, each highlighted with its other options a tap away. */
export function CheckMain({ rec, chat, file, locked, onAnswer }: Pick<Props, "rec" | "chat" | "file" | "locked" | "onAnswer">) {
  return (
    <div className="flex flex-col gap-6">
      <Questions rec={rec} chat={chat} file={file} frozen={locked} onAnswer={onAnswer} />
      <SureFacts rec={rec} chat={chat} file={file} frozen={locked} onAnswer={onAnswer} />
    </div>
  )
}

/**
 * Beside it on wide screens (under it on narrow ones): one card with the setup in plain words
 * (Change opens every setting) and the book's name, then Create. On wide screens the column sticks
 * to the top of the view; on narrow ones the footer sticks to the bottom, so Create stays in reach.
 * "Set it up myself" opens the step-by-step wizard with all of this kept.
 */
export function CheckAside({ rec, chat, file, pageCount, locked, onSetting, onCreate, onManual }: Omit<Props, "onAnswer">) {
  const derived = chat.derived!
  const evidence = useGuidedIdea("evidence")
  const create = useCreate(onCreate)
  return (
    <aside className="gd-aside flex flex-col gap-3 max-lg:contents lg:sticky lg:top-6 lg:self-start">
      <div inert={locked} className="lc-surface flex flex-col gap-3.5 p-4 sm:px-5">
        {evidence === "e24" ? (
          <SettingsSentence rec={rec} derived={derived} onChange={onSetting} frozen={locked} onAllSettings={onManual} />
        ) : (
          <SettingsCard rec={rec} derived={derived} onChange={onSetting} frozen={locked} numPages={pageCount} file={file} onAllSettings={onManual} />
        )}
        <div className="h-px bg-border/70" />
        <NameField />
      </div>
      <div className="gd-foot sticky bottom-0 z-10 -mx-2 flex flex-wrap items-center justify-between gap-3 px-2 pb-4 pt-4 lg:static lg:mx-0 lg:flex-col-reverse lg:items-stretch lg:bg-none lg:p-0">
        <button type="button" onClick={onManual} className="lc-link -ml-2 inline-flex min-h-10 items-center gap-1.5 px-3 text-[14px] font-medium lg:ml-0 lg:justify-center">
          <Wrench className="size-4" />
          <Trans>Set it up myself</Trans>
        </button>
        <PrimaryButton onClick={create} disabled={locked} icon={<Sparkles className="size-4" />} className={cn(LC_PRIMARY, "lg:w-full lg:justify-center")}>
          <Trans>Create book</Trans>
        </PrimaryButton>
      </div>
    </aside>
  )
}
