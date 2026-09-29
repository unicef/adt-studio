import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

const TONE = {
  neutral: { box: "border-border bg-muted/40", icon: "bg-white text-muted-foreground ring-1 ring-border" },
  warning: { box: "border-amber-200 bg-amber-50/70", icon: "bg-white text-amber-600 ring-1 ring-amber-200" },
} as const

/** The one thing about this book the author has to know before choosing anything. Sits at the
 *  top of the settings panel in every state that has something to say, so it is always in the
 *  same place and never pushes the preview around. */
export function StatusCallout({
  tone,
  icon: Icon,
  title,
  children,
  testId,
}: {
  testId?: string
  tone: keyof typeof TONE
  icon: typeof import("lucide-react").Cloud
  title: ReactNode
  children?: ReactNode
}) {
  return (
    <div
      data-testid={testId}
      className={cn(
        "flex items-start gap-3 rounded-xl border px-3.5 py-3",
        TONE[tone].box,
      )}
    >
      <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", TONE[tone].icon)}>
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="text-sm font-medium leading-5 text-foreground">{title}</p>
        {children ? <div className="text-xs leading-5 text-muted-foreground">{children}</div> : null}
      </div>
    </div>
  )
}
