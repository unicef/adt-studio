import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

export interface EmptyStateProps {
  icon?: ReactNode
  illustration?: ReactNode
  title: ReactNode
  description?: ReactNode
  children?: ReactNode
  bloom?: boolean
  className?: string
}

export function EmptyState({ icon, illustration, title, description, children, bloom, className }: EmptyStateProps) {
  return (
    <div className={cn("relative overflow-hidden text-center", className)}>
      {bloom && (
        <>
          <div className="pointer-events-none absolute -right-16 -top-28 size-[520px] rounded-full bg-[radial-gradient(circle,rgba(43,127,255,.14),transparent_70%)]" />
          <div className="pointer-events-none absolute -bottom-32 -left-20 size-[360px] rounded-full bg-[radial-gradient(circle,rgba(43,127,255,.08),transparent_70%)]" />
        </>
      )}
      <div className="relative">
        {illustration ??
          (icon && (
            <div className="mx-auto mb-4 grid size-[70px] place-items-center rounded-[20px] bg-brand-600 text-primary-foreground shadow-[0_30px_60px_-20px_rgba(43,127,255,0.25),0_4px_14px_rgba(0,0,0,0.08)] [&_svg]:size-[34px]">
              {icon}
            </div>
          ))}
        <div className="text-[19px] font-bold tracking-[-0.01em]">{title}</div>
        {description && (
          <div className="mx-auto mt-2 max-w-[400px] text-[13px] leading-relaxed text-muted-foreground">{description}</div>
        )}
        {children && <div className="mt-5 flex justify-center gap-2.5">{children}</div>}
      </div>
    </div>
  )
}
