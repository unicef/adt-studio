import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

export const HEADER_BUTTON = cn(
  "flex h-9 items-center gap-2 rounded-[10px] border bg-card text-[12.5px] font-semibold shadow-sm",
  "transition-[background-color,box-shadow,transform,border-color,opacity] duration-150 ease-out motion-reduce:transition-none",
  "hover:-translate-y-px hover:border-[color-mix(in_srgb,var(--chrome-hex)_40%,transparent)] hover:shadow-md active:translate-y-0 active:scale-[0.98]",
  "disabled:pointer-events-none disabled:opacity-45 disabled:shadow-none",
  "outline-none focus-visible:border-[color-mix(in_srgb,var(--chrome-hex)_55%,transparent)] focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--chrome-hex)_45%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-background",
)

export const HEADER_BUTTON_LABELLED = "pr-3 pl-1.5"

export const HEADER_BUTTON_ICON = "w-9 justify-center text-muted-foreground hover:text-foreground"

export const HEADER_MENU_OPEN = cn(
  "group/headermenu data-[state=open]:translate-y-0 data-[state=open]:shadow-sm",
  "data-[state=open]:border-[color-mix(in_srgb,var(--chrome-hex)_45%,transparent)] data-[state=open]:bg-[color-mix(in_srgb,var(--chrome-hex)_6%,var(--card))]",
)

export function HeaderButtonTile({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span className="grid size-6 shrink-0 place-items-center rounded-md bg-[color-mix(in_srgb,var(--chrome-hex)_14%,transparent)] text-[var(--chrome-hex)]">
      <Icon className="size-3.5" />
    </span>
  )
}
