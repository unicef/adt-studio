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
        "flex flex-col gap-5 rounded-xl border border-[#e5e5e5] bg-white p-5 dark:border-border dark:bg-card",
        className
      )}
    >
      {(title || description) && (
        <div className="flex flex-col gap-1">
          {title && (
            <h3 className="text-[15px] font-semibold text-[#0a0a0a] tracking-tight dark:text-foreground">{title}</h3>
          )}
          {description && (
            <p className="text-[12.5px] text-[#737373] leading-relaxed dark:text-muted-foreground">
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
      {hint && <p className="text-xs text-[#737373] leading-relaxed dark:text-muted-foreground">{hint}</p>}
    </div>
  )
}
