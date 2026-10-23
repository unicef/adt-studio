import { Check, Loader2, RefreshCw } from "lucide-react"
import { cn } from "@/lib/utils"
import type { DockItem } from "@/components/app/screens/pipeline/shared/usePipelineState"
import { SolidHover, solidIconClassName } from "./hoverFx"

const glyphClassName = "absolute -right-1.5 -bottom-1.5 grid size-[15px] place-items-center rounded-full ring-[1.5px] ring-[var(--dock-surface)]"

function StatusGlyph({ item, attention }: { item: DockItem; attention: boolean }) {
  if (item.state === "running" || item.state === "queued")
    return (
      <span aria-hidden className={cn(glyphClassName, "bg-sky-600 text-white")}>
        <Loader2 className="size-2.5 animate-spin motion-reduce:animate-none" strokeWidth={3} />
      </span>
    )
  if (item.state === "error")
    return (
      <span aria-hidden className={cn(glyphClassName, "bg-red-600 text-[10px] leading-none font-bold text-white")}>
        !
      </span>
    )
  if (item.pending > 0)
    return (
      <span aria-hidden className={cn(glyphClassName, "w-auto min-w-[15px] bg-amber-400 px-[3px] text-[9px] leading-none font-bold text-zinc-950")}>
        {item.pending > 9 ? "9+" : item.pending}
      </span>
    )
  if (attention)
    return (
      <span aria-hidden className={cn(glyphClassName, "bg-amber-400 text-zinc-950")}>
        <RefreshCw className="size-2.5" strokeWidth={3} />
      </span>
    )
  return (
    <span aria-hidden className={cn(glyphClassName, "bg-emerald-600 text-white")}>
      <Check className="size-2.5" strokeWidth={3.4} />
    </span>
  )
}

export function InBookTile({ item, attention }: { item: DockItem; attention: boolean }) {
  return (
    <span
      className={cn(
        "relative grid size-8 place-items-center rounded-[10px] border",
        "border-[color-mix(in_srgb,var(--tint)_45%,transparent)] bg-[color-mix(in_srgb,var(--tint)_16%,transparent)]",
      )}
    >
      <SolidHover />
      <item.icon className={cn("size-[18px]", solidIconClassName)} strokeWidth={1.9} style={{ ["--icon" as string]: item.hex }} />
      <StatusGlyph item={item} attention={attention} />
    </span>
  )
}
