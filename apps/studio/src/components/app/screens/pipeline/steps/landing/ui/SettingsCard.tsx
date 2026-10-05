import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

export function SettingsCard({
  title,
  description,
  className,
  children,
}: {
  title?: ReactNode
  description?: ReactNode
  className?: string
  children: ReactNode
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-5 rounded-xl border border-border bg-card p-5",
        className
      )}
    >
      {(title || description) && (
        <div className="flex flex-col gap-1">
          {title && (
            <h3 className="text-[15px] font-semibold text-foreground tracking-tight">{title}</h3>
          )}
          {description && (
            <p className="text-[12.5px] text-muted-foreground leading-relaxed">
              {description}
            </p>
          )}
        </div>
      )}

      <div className="flex flex-col gap-5">{children}</div>
    </div>
  )
}

export function SettingsField({
  label,
  labelAction,
  hint,
  htmlFor,
  children,
}: {
  label: ReactNode
  labelAction?: ReactNode
  hint?: ReactNode
  htmlFor?: string
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1">
        <label
          htmlFor={htmlFor}
          className="text-sm font-semibold leading-5 text-foreground"
        >
          {label}
        </label>
        {labelAction}
      </div>
      {children}
      {hint && <p className="text-xs text-muted-foreground leading-relaxed">{hint}</p>}
    </div>
  )
}
