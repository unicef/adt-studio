import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

/** A titled card whose body scrolls on its own, so the dashboard never scrolls as a page.
 *  `scroll={false}` hands the body's height to its children instead, for panels that keep a
 *  fixed header of their own (filters, a composer) above a list that scrolls by itself. */
export function DashboardPanel({
  title,
  count,
  tone = "neutral",
  action,
  footer,
  children,
  className,
  scroll = true,
}: {
  title: ReactNode
  count?: number
  tone?: "neutral" | "attention"
  action?: ReactNode
  footer?: ReactNode
  children: ReactNode
  className?: string
  scroll?: boolean
}) {
  return (
    <section className={cn("flex min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border bg-card", className)}>
      <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
        <h3 className="text-sm font-semibold tracking-tight text-foreground">{title}</h3>
        {count !== undefined ? <DashboardCount value={count} tone={tone} /> : null}
        <span className="ml-auto flex items-center gap-1">{action}</span>
      </header>
      <div className={cn("min-h-0 flex-1", scroll ? "overflow-y-auto overscroll-contain" : "flex flex-col overflow-hidden")}>
        {children}
      </div>
      {footer ? <footer className="shrink-0 border-t px-2 py-1.5">{footer}</footer> : null}
    </section>
  )
}

export function DashboardCount({ value, tone = "neutral" }: { value: number; tone?: "neutral" | "attention" }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums transition-colors duration-200 motion-reduce:transition-none",
        tone === "attention" && value > 0
          ? "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200"
          : "bg-muted text-muted-foreground",
      )}
    >
      {value}
    </span>
  )
}

export function SkeletonRows({ rows = 3 }: { rows?: number }) {
  return (
    <ul aria-hidden="true" className="flex list-none flex-col divide-y p-0">
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className="flex items-start gap-3 px-4 py-3">
          <span className="size-7 shrink-0 rounded-full bg-muted motion-safe:animate-pulse" />
          <span className="flex flex-1 flex-col gap-2 pt-0.5">
            <span className="h-3 w-1/3 rounded bg-muted motion-safe:animate-pulse" />
            <span className="h-3 w-4/5 rounded bg-muted/70 motion-safe:animate-pulse" />
          </span>
        </li>
      ))}
    </ul>
  )
}

export function PanelEmpty({
  icon,
  title,
  body,
  tone = "neutral",
  action,
}: {
  icon: ReactNode
  title: ReactNode
  body: ReactNode
  tone?: "neutral" | "good" | "attention"
  action?: ReactNode
}) {
  return (
    <div className="h-full min-h-full [container-type:size]">
      <div className="flex h-full flex-col items-center justify-center gap-2 px-8 py-6 text-center motion-safe:animate-in motion-safe:fade-in-0 [@container(max-height:11rem)]:flex-row [@container(max-height:11rem)]:gap-3 [@container(max-height:11rem)]:px-5 [@container(max-height:11rem)]:py-2 [@container(max-height:11rem)]:text-left">
        <span
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-full [@container(max-height:11rem)]:size-8",
            tone === "good" && "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300",
            tone === "attention" && "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300",
            tone === "neutral" && "bg-muted text-muted-foreground",
          )}
        >
          {icon}
        </span>
        <div className="flex min-w-0 flex-col items-center gap-2 [@container(max-height:11rem)]:items-start [@container(max-height:11rem)]:gap-0.5">
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <p className="max-w-72 text-xs leading-5 text-muted-foreground [@container(max-height:11rem)]:line-clamp-2 [@container(max-height:11rem)]:max-w-none">{body}</p>
          {action ? <div className="mt-1">{action}</div> : null}
        </div>
      </div>
    </div>
  )
}
