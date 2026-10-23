import { Trans, useLingui } from "@lingui/react/macro"
import { cn } from "@/lib/utils"
import { STORYBOARD_HEX } from "@/components/app/screens/pipeline/shared/plugins"
import { highlightStyle } from "@/components/app/screens/pipeline/plugins/dock/StoryboardEntry"
import { SKIN } from "@/components/app/screens/pipeline/plugins/dock/style"
import { Caption, ExtrasRow, MiniPage, SetupPath, StoryboardPill, quietShellClassName, shellClassName, type Here } from "./parts"

export function IslandsClassic({ here }: { here: Here }) {
  return (
    <div className="flex items-center gap-3">
      <div className={shellClassName}>
        <SetupPath />
        <StoryboardPill on={here === "storyboard"} />
      </div>
      <div className={shellClassName}>
        <ExtrasRow here={here} />
      </div>
    </div>
  )
}

export function IslandsBook({ here }: { here: Here }) {
  const { t } = useLingui()
  const on = here === "storyboard"
  return (
    <div className="flex items-center gap-3">
      <div className={shellClassName}>
        <SetupPath />
        <span
          className={cn("flex h-12 shrink-0 items-center gap-2.5 rounded-[16px] pr-4 pl-2", on ? "text-white" : SKIN.strong)}
          style={on ? highlightStyle(STORYBOARD_HEX) : undefined}
        >
          <MiniPage on={on} size="sm" />
          <span className="flex flex-col leading-tight">
            <span className="text-[13.5px] font-semibold">
              <Trans>Storyboard</Trans>
            </span>
            <span className={cn("text-[11px] font-medium", on ? "text-white/75" : SKIN.muted)}>{t`21 pages`}</span>
          </span>
        </span>
      </div>
      <div className={shellClassName}>
        <ExtrasRow here={here} />
      </div>
    </div>
  )
}

export function IslandsQuiet({ here }: { here: Here }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className={shellClassName}>
        <SetupPath />
        <StoryboardPill on={here === "storyboard"} large />
      </div>
      <div className={quietShellClassName}>
        <ExtrasRow here={here} size="sm" />
      </div>
    </div>
  )
}

export function IslandsCaptioned({ here }: { here: Here }) {
  return (
    <div className="flex items-center gap-3 pt-3">
      <div className={cn(shellClassName, "relative")}>
        <Caption>
          <Trans>Your book</Trans>
        </Caption>
        <SetupPath />
        <StoryboardPill on={here === "storyboard"} />
      </div>
      <div className={cn(shellClassName, "relative")}>
        <Caption>
          <Trans>Extras</Trans>
        </Caption>
        <ExtrasRow here={here} />
      </div>
    </div>
  )
}
