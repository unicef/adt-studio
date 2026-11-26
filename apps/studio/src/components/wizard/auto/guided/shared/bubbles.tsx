import type { CSSProperties, ReactNode } from "react"
import { cn } from "@/lib/utils"

/** The assistant: the board's small orb in brand blue (turns slowly while it writes). Decoration only. */
export function Orb({ typing, hidden, size = 28, className }: { typing?: boolean; hidden?: boolean; size?: number; className?: string }) {
  return <span aria-hidden data-typing={typing || undefined} data-hidden={hidden || undefined} className={cn("lc-orb", className)} style={{ "--lc-orb": `${size}px` } as CSSProperties} />
}

/** A reply the user can tap. */
export function Chip({ onClick, children, icon, primary, pressed, disabled, className }: { onClick: () => void; children: ReactNode; icon?: ReactNode; primary?: boolean; pressed?: boolean; disabled?: boolean; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={pressed}
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full font-semibold transition-[transform,background-color,box-shadow,color] duration-150 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50",
        "h-11 px-4 text-[14.5px] font-medium",
        primary ? "lc-btn rounded-full" : "bg-[var(--lc-bubble)] text-foreground ring-1 ring-border hover:bg-[var(--lc-stage)]",
        className,
      )}
    >
      {icon}
      {children}
    </button>
  )
}
