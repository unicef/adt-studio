import type { ReactNode } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { cn } from "@/lib/utils"
import { STORYBOARD_HEX } from "@/components/app/screens/pipeline/shared/plugins"
import { highlightStyle } from "@/components/app/screens/pipeline/plugins/dock/StoryboardEntry"
import { SKIN } from "@/components/app/screens/pipeline/plugins/dock/style"
import { Divider, ExtrasRow, MiniPage, SETUP, shellClassName, softActiveClassName, type Here } from "./parts"

function Block({ on, soft = false, className, children }: { on: boolean; soft?: boolean; className?: string; children: ReactNode }) {
  return (
    <span
      className={cn(
        "relative flex h-[60px] shrink-0 items-center gap-3 rounded-[18px]",
        on ? (soft ? softActiveClassName : "text-white") : cn(SKIN.strong, "bg-zinc-950/[0.035] dark:bg-white/[0.05]"),
        className,
      )}
      style={{ ["--tint" as string]: STORYBOARD_HEX, ...(on && !soft ? highlightStyle(STORYBOARD_HEX) : {}) }}
    >
      {children}
    </span>
  )
}

function SetupIcons({ white }: { white: boolean }) {
  return (
    <>
      {SETUP.map((item) => (
        <span key={item.slug} className="grid size-9 place-items-center rounded-[11px]">
          <item.icon aria-hidden className="size-[18px]" strokeWidth={2} style={{ color: white ? "#ffffff" : item.hex }} />
        </span>
      ))}
    </>
  )
}

function Titles({ title, sub, on, soft = false }: { title: ReactNode; sub: string; on: boolean; soft?: boolean }) {
  return (
    <span className="flex min-w-0 flex-col leading-tight">
      <span className="max-w-[150px] truncate text-[14.5px] font-semibold">{title}</span>
      <span className={cn("text-[11.5px] font-medium", on && !soft ? "text-white/75" : on ? "text-violet-700/80 dark:text-violet-200/80" : SKIN.muted)}>{sub}</span>
    </span>
  )
}

export function BaseOriginal({ here }: { here: Here }) {
  const { t } = useLingui()
  const on = here === "storyboard"
  return (
    <div className={shellClassName}>
      <Block on={on} className="pr-2 pl-2.5">
        <MiniPage on={on} />
        <Titles title={<Trans>Storyboard</Trans>} sub={t`21 pages · v4`} on={on} />
        <span aria-hidden className={cn("mx-1.5 h-7 w-px", on ? "bg-white/30" : SKIN.divider)} />
        <SetupIcons white={on} />
      </Block>
      <Divider />
      <ExtrasRow here={here} />
    </div>
  )
}

export function BaseSoft({ here }: { here: Here }) {
  const { t } = useLingui()
  const on = here === "storyboard"
  return (
    <div className={shellClassName}>
      <Block on={on} soft className="pr-2 pl-2.5">
        <MiniPage on={false} />
        <Titles title={<Trans>Storyboard</Trans>} sub={t`21 pages · v4`} on={on} soft />
        <span aria-hidden className={cn("mx-1.5 h-7 w-px", SKIN.divider)} />
        <SetupIcons white={false} />
      </Block>
      <Divider />
      <ExtrasRow here={here} />
    </div>
  )
}

export function BasePage({ here }: { here: Here }) {
  const { t } = useLingui()
  const on = here === "storyboard"
  return (
    <div className={shellClassName}>
      <span className="flex flex-col gap-0.5 px-0.5">
        {SETUP.map((item) => (
          <span key={item.slug} className="grid size-[27px] place-items-center rounded-[8px] bg-[color-mix(in_srgb,var(--tint)_12%,transparent)]" style={{ ["--tint" as string]: item.hex }}>
            <item.icon aria-hidden className="size-3.5" strokeWidth={2} style={{ color: item.hex }} />
          </span>
        ))}
      </span>
      <Block on={on} className="pr-4 pl-2.5">
        <MiniPage on={on} />
        <Titles title={<Trans>Storyboard</Trans>} sub={t`Page 8 of 21`} on={on} />
      </Block>
      <Divider />
      <ExtrasRow here={here} />
    </div>
  )
}

export function BaseCover({ here }: { here: Here }) {
  const { t } = useLingui()
  const on = here === "storyboard"
  return (
    <div className={shellClassName}>
      <Block on={on} className="pr-2 pl-2.5">
        <MiniPage on={on} kind="cover" />
        <Titles title={t`Triste fim de Policarpo Quaresma`} sub={t`Storyboard · 21 pages`} on={on} />
        <span aria-hidden className={cn("mx-1 h-7 w-px", on ? "bg-white/30" : SKIN.divider)} />
        <SetupIcons white={on} />
      </Block>
      <Divider />
      <ExtrasRow here={here} />
    </div>
  )
}
