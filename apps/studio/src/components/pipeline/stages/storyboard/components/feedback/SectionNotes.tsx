import type { ReactNode } from "react"
import { Trans } from "@lingui/react/macro"
import { AlertTriangle, ArrowRight, CheckCircle2, Loader2 } from "lucide-react"
import type { SectionComments } from "./use-section-comments"

/**
 * The one line a variant shows when there is no pin to talk about: still loading, couldn't load,
 * nothing waiting here — and, whichever it is, that other sections of the page have comments.
 */
export function SectionNotes({
  comments,
  onNavigateSection,
}: {
  comments: SectionComments
  onNavigateSection?: (index: number) => void
}) {
  const lines: ReactNode[] = []
  if (comments.loading) {
    lines.push(
      <Note key="loading" icon={<Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />}>
        <Trans>Loading the comments…</Trans>
      </Note>,
    )
  } else if (comments.failed) {
    lines.push(
      <Note key="failed" tone="attention" icon={<AlertTriangle className="size-3.5" aria-hidden="true" />}>
        <Trans>Can't reach the comments right now.</Trans>
      </Note>,
    )
  } else if (comments.measuring.length > 0) {
    lines.push(
      <Note key="measuring" icon={<Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />}>
        <Trans>Placing the pins…</Trans>
      </Note>,
    )
  } else if (comments.threads.length === 0) {
    lines.push(
      <Note key="empty" icon={<CheckCircle2 className="size-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />}>
        <Trans>Nothing waiting on this section.</Trans>
      </Note>,
    )
  }
  const next = comments.nextSection
  const nextOnThisPage = next !== null && comments.elsewhere.some((entry) => entry.sectionId === next.sectionId)
  for (const entry of comments.elsewhere) {
    const number = entry.index + 1
    const count = entry.count
    lines.push(
      <button
        key={entry.sectionId}
        type="button"
        onClick={() => onNavigateSection?.(entry.index)}
        className="flex items-center gap-1.5 rounded-full border bg-card/95 px-2.5 py-1 text-[11px] font-medium text-foreground shadow-sm backdrop-blur transition-colors duration-150 hover:bg-muted motion-reduce:transition-none"
      >
        <Trans>
          Section {number} · {count} waiting
        </Trans>
        <ArrowRight className="size-3" aria-hidden="true" />
      </button>,
    )
  }
  if (next !== null && !nextOnThisPage) {
    const page = next.pageNumber
    const count = next.waiting
    lines.push(
      <button
        key="next"
        type="button"
        onClick={() => comments.goTo(next)}
        className="flex items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50/95 px-2.5 py-1 text-[11px] font-medium text-brand-800 shadow-sm backdrop-blur transition-colors duration-150 hover:bg-brand-100 motion-reduce:transition-none dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-100 dark:hover:bg-brand-500/20"
      >
        <Trans>
          Next with comments: page {page} · {count}
        </Trans>
        <ArrowRight className="size-3" aria-hidden="true" />
      </button>,
    )
  }
  if (lines.length === 0) return null
  return <div className="flex flex-wrap items-center gap-1.5">{lines}</div>
}

function Note({
  icon,
  tone = "neutral",
  children,
}: {
  icon: ReactNode
  tone?: "neutral" | "attention"
  children: ReactNode
}) {
  return (
    <span
      role="status"
      className={
        tone === "attention"
          ? "flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50/95 px-2.5 py-1 text-[11px] text-amber-900 shadow-sm backdrop-blur dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100"
          : "flex items-center gap-1.5 rounded-full border bg-card/95 px-2.5 py-1 text-[11px] text-muted-foreground shadow-sm backdrop-blur"
      }
    >
      {icon}
      {children}
    </span>
  )
}
