import { useId, type ReactNode } from "react"
import { BrandedSwitch } from "@/components/ui/branded-switch"
import { cn } from "@/lib/utils"

/**
 * Clickable card with a title + description on the left and a switch on the
 * right — the standard "single boolean setting" pattern used across landing
 * pages (Figure Extraction, Activity Detection, …).
 */
export function ToggleCard({
  title,
  description,
  checked,
  onCheckedChange,
  disabled = false,
  className,
}: {
  title: ReactNode
  description: ReactNode
  checked: boolean
  onCheckedChange: (next: boolean) => void
  disabled?: boolean
  className?: string
}) {
  const id = useId()
  const titleId = `${id}-title`
  const subtitleId = `${id}-subtitle`

  const toggle = () => {
    if (disabled) return
    onCheckedChange(!checked)
  }

  return (
    <div
      role="switch"
      id={id}
      aria-checked={checked}
      aria-disabled={disabled}
      aria-labelledby={titleId}
      aria-describedby={subtitleId}
      tabIndex={disabled ? -1 : 0}
      onClick={toggle}
      onKeyDown={(e) => {
        if (disabled) return
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault()
          toggle()
        }
      }}
      className={cn(
        "flex w-full select-none items-center justify-center gap-2.5 rounded-lg border px-4 py-3 shadow-sm transition-colors",
        "bg-card border-border",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        disabled
          ? "cursor-not-allowed opacity-60"
          : "cursor-pointer hover:bg-muted hover:border-input",
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col items-start justify-center gap-0.5">
        <p
          id={titleId}
          className="select-none text-sm font-semibold leading-5 text-foreground"
        >
          {title}
        </p>
        <p
          id={subtitleId}
          className="w-full select-none text-xs font-normal leading-4 text-muted-foreground"
        >
          {description}
        </p>
      </div>
      <BrandedSwitch checked={checked} decorative disabled={disabled} />
    </div>
  )
}
