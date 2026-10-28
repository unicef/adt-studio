import type { ReactNode } from "react"
import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

export function PageSection({
  icon: Icon,
  title,
  aside,
  empty,
  children,
  className,
}: {
  icon: LucideIcon
  title: ReactNode
  aside?: ReactNode
  empty?: ReactNode
  children?: ReactNode
  className?: string
}) {
  if (empty)
    return (
      <p className={cn("flex min-h-7 items-center gap-2 text-[12.5px] text-muted-foreground", className)}>
        <Icon className="size-3.5 shrink-0" />
        {empty}
      </p>
    )
  return (
    <section className={cn("flex flex-col gap-2.5", className)}>
      <header className="flex min-h-7 items-center gap-2">
        <Icon className="size-3.5 text-muted-foreground" />
        <h2 className="text-[13px] font-semibold text-foreground">{title}</h2>
        {aside && <div className="ml-auto flex items-center gap-2">{aside}</div>}
      </header>
      {children}
    </section>
  )
}
