import type { ReactNode } from "react"
import type { LucideIcon } from "lucide-react"

/**
 * One block of the publishing dashboard.
 *
 * The whole page is a stack of these, so every section announces itself the same way: an icon,
 * a heading, an optional count on the right. Consistent framing is what lets a reader skim a
 * long page — a dashboard whose sections each look different has to be read.
 */
export function PublishingSection({
  icon: Icon,
  title,
  aside,
  children,
}: {
  icon: LucideIcon
  title: ReactNode
  aside?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="flex shrink-0 flex-col gap-3">
      <div className="flex items-center gap-2">
        <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <h2 className="flex-1 text-sm font-semibold tracking-tight text-foreground">{title}</h2>
        {aside ? (
          <span className="text-xs tabular-nums text-muted-foreground">{aside}</span>
        ) : null}
      </div>
      {children}
    </section>
  )
}
