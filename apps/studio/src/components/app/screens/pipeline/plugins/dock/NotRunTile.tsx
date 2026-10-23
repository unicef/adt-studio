import { Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import type { DockItem } from "@/components/app/screens/pipeline/shared/usePipelineState"
import { SolidHover, solidIconClassName } from "./hoverFx"

const badgeClassName = cn(
  "absolute -right-1.5 -bottom-1.5 grid size-[15px] place-items-center rounded-full ring-[1.5px] ring-[var(--dock-surface)]",
  "bg-[color-mix(in_srgb,var(--tint)_18%,var(--dock-surface))] text-[color-mix(in_srgb,var(--tint)_78%,black)]",
  "dark:bg-[color-mix(in_srgb,var(--tint)_32%,var(--dock-surface))] dark:text-[color-mix(in_srgb,var(--tint)_45%,white)]",
)

export function NotRunTile({ item }: { item: DockItem }) {
  return (
    <span
      className={cn("relative grid size-8 place-items-center rounded-[10px] border border-dashed")}
      style={{ borderColor: `color-mix(in srgb, ${item.hex} 70%, transparent)` }}
    >
      <SolidHover />
      <item.icon
        className={cn("size-4", solidIconClassName)}
        strokeWidth={1.9}
        style={{ ["--icon" as string]: `color-mix(in srgb, ${item.hex} 85%, black)` }}
      />
      <span className={badgeClassName}>
        <Plus className="size-2.5" strokeWidth={3.2} />
      </span>
    </span>
  )
}
