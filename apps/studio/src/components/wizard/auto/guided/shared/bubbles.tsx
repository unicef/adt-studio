import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

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
        primary ? "rounded-full bg-[var(--lc-accent)] font-semibold text-[var(--lc-accent-ink)] hover:bg-[var(--lc-accent-hover)]" : "bg-[var(--lc-bubble)] text-foreground ring-1 ring-border hover:bg-[var(--lc-stage)]",
        className,
      )}
    >
      {icon}
      {children}
    </button>
  )
}
