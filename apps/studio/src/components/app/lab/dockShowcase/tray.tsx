import { Trans } from "@lingui/react/macro"
import { ChevronUp } from "lucide-react"
import { cn } from "@/lib/utils"
import { getStageLabelI18n } from "@/components/pipeline/pipeline-i18n"
import { highlightStyle } from "@/components/app/screens/pipeline/plugins/dock/StoryboardEntry"
import { SKIN } from "@/components/app/screens/pipeline/plugins/dock/style"
import { Divider, EXTRAS, SetupPath, StoryboardPill, Tile, shellClassName, type Here } from "./parts"

const trayButtonClassName = cn("flex h-12 shrink-0 items-center gap-2.5 rounded-[16px] pr-3 pl-2.5 text-[13.5px] font-semibold", SKIN.strong, "bg-zinc-950/[0.04] dark:bg-white/[0.06]")

function Count({ value }: { value: number }) {
  return <span className={cn("rounded-full px-1.5 text-[11px] tabular-nums", SKIN.muted, "bg-zinc-950/[0.06] dark:bg-white/[0.1]")}>{value}</span>
}

function Stack() {
  return (
    <span className="flex -space-x-2">
      {EXTRAS.slice(0, 4).map((item) => (
        <span key={item.slug} className="grid size-6 place-items-center rounded-full ring-2 ring-white dark:ring-zinc-950" style={{ backgroundColor: `color-mix(in srgb, ${item.hex} 22%, white)` }}>
          <item.icon aria-hidden className="size-3.5" strokeWidth={2} style={{ color: item.hex }} />
        </span>
      ))}
    </span>
  )
}

function BookPath({ here }: { here: Here }) {
  return (
    <>
      <SetupPath />
      <StoryboardPill on={here === "storyboard"} large />
      <Divider />
    </>
  )
}

export function TrayOriginal({ here }: { here: Here }) {
  const current = EXTRAS.find((item) => item.slug === here)
  return (
    <div className={shellClassName}>
      <BookPath here={here} />
      {current && <Tile item={current} here />}
      <span className={trayButtonClassName}>
        <Stack />
        <Trans>Extras</Trans>
        <Count value={EXTRAS.length} />
        <ChevronUp aria-hidden className={cn("size-4", SKIN.muted)} />
      </span>
    </div>
  )
}

export function TrayFolder({ here }: { here: Here }) {
  const current = EXTRAS.find((item) => item.slug === here)
  return (
    <div className={shellClassName}>
      <BookPath here={here} />
      {current && <Tile item={current} here />}
      <span className="relative grid size-12 shrink-0 grid-cols-3 place-content-center gap-[3px] rounded-[16px] bg-zinc-950/[0.05] p-[7px] dark:bg-white/[0.07]">
        {EXTRAS.map((item) => (
          <span key={item.slug} className="grid size-[9px] place-items-center rounded-[3px]" style={{ backgroundColor: item.hex }} />
        ))}
        <span className="absolute -top-1 -right-1 grid h-4 min-w-4 place-items-center rounded-full bg-zinc-900 px-1 text-[9.5px] font-bold text-white ring-2 ring-white dark:bg-white dark:text-zinc-900 dark:ring-zinc-950">
          {EXTRAS.length}
        </span>
      </span>
    </div>
  )
}

export function TrayWhere({ here }: { here: Here }) {
  const current = EXTRAS.find((item) => item.slug === here)
  return (
    <div className={shellClassName}>
      <BookPath here={here} />
      {current ? (
        <span className="flex h-12 shrink-0 items-center gap-2.5 rounded-[16px] pr-3 pl-4 text-[14px] font-semibold text-white" style={highlightStyle(current.hex)}>
          <current.icon aria-hidden className="size-5" strokeWidth={2} />
          {getStageLabelI18n(current.slug)}
          <span aria-hidden className="h-5 w-px bg-white/30" />
          <ChevronUp aria-hidden className="size-4 text-white/80" />
        </span>
      ) : (
        <span className={trayButtonClassName}>
          <Stack />
          <Trans>Extras</Trans>
          <Count value={EXTRAS.length} />
          <ChevronUp aria-hidden className={cn("size-4", SKIN.muted)} />
        </span>
      )}
    </div>
  )
}

export function TrayRecent({ here }: { here: Here }) {
  const recent = [EXTRAS.find((item) => item.slug === "easy-read"), EXTRAS.find((item) => item.slug === "captions"), EXTRAS.find((item) => item.slug === "translate")].flatMap((item) => (item ? [item] : []))
  return (
    <div className={shellClassName}>
      <BookPath here={here} />
      {recent.map((item) => (
        <Tile key={item.slug} item={item} here={here === item.slug} />
      ))}
      <span className={cn(trayButtonClassName, "pl-3.5")}>
        <Trans>More</Trans>
        <Count value={EXTRAS.length - recent.length} />
        <ChevronUp aria-hidden className={cn("size-4", SKIN.muted)} />
      </span>
    </div>
  )
}
