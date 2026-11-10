import type { LucideIcon } from "lucide-react"
import { Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

export function ClipIconButton({
  icon: Icon,
  label,
  onClick,
  disabled = false,
  busy = false,
  pressed,
  hex,
}: {
  icon: LucideIcon
  label: string
  onClick: () => void
  disabled?: boolean
  busy?: boolean
  pressed?: boolean
  hex: string
}) {
  const blocked = disabled || busy
  return (
    <button
      type="button"
      onClick={blocked ? undefined : onClick}
      aria-disabled={blocked || undefined}
      aria-pressed={pressed}
      aria-busy={busy || undefined}
      title={label}
      aria-label={label}
      style={{ ["--clip-accent" as string]: hex }}
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-lg border bg-card text-muted-foreground transition-[background-color,color,opacity,border-color] duration-200 motion-reduce:transition-none",
        "outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--clip-accent)_45%,transparent)]",
        pressed && "border-[color-mix(in_srgb,var(--clip-accent)_40%,transparent)] bg-[color-mix(in_srgb,var(--clip-accent)_10%,transparent)] text-[var(--clip-accent)]",
        disabled ? "cursor-default opacity-45" : busy ? "cursor-progress" : "cursor-pointer hover:bg-muted hover:text-foreground",
      )}
    >
      {busy ? <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" /> : <Icon className="size-3.5" />}
    </button>
  )
}
