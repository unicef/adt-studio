import type { ReactNode } from "react"
import { Trans } from "@lingui/react/macro"
import { ChevronRight, LayoutGrid } from "lucide-react"
import { cn } from "@/lib/utils"
import { FOUNDATIONS, PLUGINS, STORYBOARD_HEX } from "@/components/app/screens/pipeline/shared/plugins"
import type { DockItem } from "@/components/app/screens/pipeline/shared/usePipelineState"
import { InBookTile } from "@/components/app/screens/pipeline/plugins/dock/InBookTile"
import { highlightStyle } from "@/components/app/screens/pipeline/plugins/dock/StoryboardEntry"
import { STEP_ORDER } from "@/components/app/screens/pipeline/plugins/dock/model"
import { SKIN } from "@/components/app/screens/pipeline/plugins/dock/style"

const done = (entry: (typeof PLUGINS)[number]): DockItem => ({ ...entry, state: "done", pending: 0 })
export const SETUP: DockItem[] = FOUNDATIONS.map(done)
export const EXTRAS: DockItem[] = STEP_ORDER.flatMap((slug) => PLUGINS.filter((entry) => entry.slug === slug)).map(done)
const ACCESS = EXTRAS.slice(0, 4)
const LEARN = EXTRAS.slice(4, 6)
const LANG = EXTRAS.slice(6)

export type Here = "storyboard" | "easy-read"

export const shellClassName = cn(SKIN.shell, "flex items-center gap-1.5 p-1.5")

export const quietShellClassName = cn(
  "flex items-center gap-1 rounded-[22px] p-1.5 backdrop-blur",
  "bg-white/60 ring-1 ring-zinc-950/[0.05] dark:bg-zinc-950/50 dark:ring-white/[0.06]",
)

export const softActiveClassName = cn(
  "bg-[color-mix(in_srgb,var(--tint)_12%,transparent)] text-violet-800 ring-[1.5px] ring-inset ring-[color-mix(in_srgb,var(--tint)_45%,transparent)]",
  "dark:bg-[color-mix(in_srgb,var(--tint)_22%,transparent)] dark:text-violet-100",
)

export function Tile({ item, here, size = "md" }: { item: DockItem; here: boolean; size?: "sm" | "md" }) {
  const box = size === "sm" ? "size-10 rounded-[13px]" : "size-12 rounded-[16px]"
  return (
    <span className={cn("group/tab relative grid shrink-0 cursor-pointer place-items-center", box)} style={{ ["--tint" as string]: item.hex, ...(here ? highlightStyle(item.hex) : {}) }}>
      {here ? <item.icon aria-hidden className="size-5 text-white" strokeWidth={2} /> : size === "sm" ? <SmallTile item={item} /> : <InBookTile item={item} attention={false} />}
    </span>
  )
}

export function SmallTile({ item }: { item: DockItem }) {
  return (
    <span className="relative grid size-7 place-items-center rounded-[9px] bg-[color-mix(in_srgb,var(--tint)_12%,transparent)]" style={{ ["--tint" as string]: item.hex }}>
      <item.icon aria-hidden className="size-4" strokeWidth={1.9} style={{ color: item.hex }} />
    </span>
  )
}

export function Arrow() {
  return <ChevronRight aria-hidden className={cn("size-3.5 shrink-0 opacity-70", SKIN.muted)} strokeWidth={2.25} />
}

export function Divider({ className }: { className?: string }) {
  return <span aria-hidden className={cn("mx-1 h-5 w-px shrink-0", SKIN.divider, className)} />
}

export function SetupPath({ trailing = true }: { trailing?: boolean }) {
  return (
    <>
      {SETUP.map((item, index) => (
        <span key={item.slug} className="flex items-center gap-1">
          {index > 0 && <Arrow />}
          <Tile item={item} here={false} size="sm" />
        </span>
      ))}
      {trailing && <Arrow />}
    </>
  )
}

export function StoryboardPill({ on, large = false, children }: { on: boolean; large?: boolean; children?: ReactNode }) {
  return (
    <span
      className={cn(
        "relative flex h-12 shrink-0 items-center gap-2.5 rounded-[16px] font-semibold tracking-[-0.005em]",
        large ? "px-6 text-[15px]" : "pr-3 pl-5 text-[14px]",
        on ? "text-white" : SKIN.strong,
      )}
      style={on ? highlightStyle(STORYBOARD_HEX) : undefined}
    >
      <LayoutGrid aria-hidden className="size-5" strokeWidth={2} style={{ color: on ? "#ffffff" : STORYBOARD_HEX }} />
      <Trans>Storyboard</Trans>
      {children}
    </span>
  )
}

export function ExtrasRow({ here, size = "md" }: { here: Here; size?: "sm" | "md" }) {
  return (
    <>
      {ACCESS.map((item) => (
        <Tile key={item.slug} item={item} here={here === item.slug} size={size} />
      ))}
      <Divider />
      {LEARN.map((item) => (
        <Tile key={item.slug} item={item} here={here === item.slug} size={size} />
      ))}
      <Arrow />
      {LANG.map((item) => (
        <Tile key={item.slug} item={item} here={here === item.slug} size={size} />
      ))}
    </>
  )
}

export function MiniPage({ on, kind = "page", size = "md" }: { on: boolean; kind?: "page" | "cover"; size?: "sm" | "md" }) {
  const box = size === "sm" ? "h-9 w-[26px] p-1 gap-[2px]" : "h-11 w-8 p-1.5 gap-[3px]"
  if (kind === "cover")
    return (
      <span aria-hidden className={cn("grid shrink-0 content-start rounded-[5px] bg-amber-400 shadow-[inset_-2px_0_0_rgba(0,0,0,0.12)]", box, on && "ring-2 ring-white/70")}>
        <span className="h-[3px] w-full rounded-full bg-zinc-900/80" />
        <span className="h-[2px] w-2/3 rounded-full bg-zinc-900/60" />
        <span className="mt-auto ml-auto h-3 w-2 rounded-t-full bg-zinc-900/85" />
      </span>
    )
  return (
    <span aria-hidden className={cn("grid shrink-0 content-start rounded-[5px]", box, on ? "bg-white/90" : "bg-white ring-1 ring-zinc-950/10 dark:bg-zinc-200")}>
      <span className="h-[3px] w-4/5 rounded-full bg-zinc-800" />
      <span className="h-[2px] w-full rounded-full bg-zinc-400" />
      <span className="h-[2px] w-full rounded-full bg-zinc-400" />
      <span className="h-[2px] w-3/4 rounded-full bg-zinc-400" />
      <span className="mt-0.5 h-2.5 w-full rounded-[2px] bg-amber-400" />
    </span>
  )
}

export function Caption({ children }: { children: ReactNode }) {
  return <span className={cn("absolute -top-5 left-3 text-[10px] font-semibold tracking-[0.1em] whitespace-nowrap uppercase", SKIN.muted)}>{children}</span>
}

export function Today({ here }: { here: Here }) {
  return (
    <div className={shellClassName}>
      {SETUP.map((item) => (
        <Tile key={item.slug} item={item} here={false} />
      ))}
      <StoryboardPill on={here === "storyboard"} />
      <Divider />
      <ExtrasRow here={here} />
    </div>
  )
}
