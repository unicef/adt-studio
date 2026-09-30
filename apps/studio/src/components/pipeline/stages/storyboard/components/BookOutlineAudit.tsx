import { useMemo, useState } from "react"
import { AlertTriangle, CheckCircle2, ChevronRight, Search } from "lucide-react"
import { Trans, useLingui } from "@lingui/react/macro"
import type {
  BookOutlineAppliedHeading,
  BookOutlineEntry,
  HeadingKind,
} from "@adt/types"
import { useBookOutlineAudit } from "@/hooks/use-debug"
import { cn } from "@/lib/utils"

export type OutlineAssignmentState = "assigned" | "missing" | "mismatch"

function expectedRole(level: number): string {
  if (level === 1) return "chapter_title"
  if (level === 2) return "section_heading"
  if (level === 3) return "subheading"
  return "heading"
}

function normalizedText(value: string): string {
  return value.replace(/\s+/g, " ").trim()
}

export function outlineAssignmentState(
  entry: BookOutlineEntry,
  assignments: BookOutlineAppliedHeading[],
): OutlineAssignmentState {
  if (assignments.length === 0) return "missing"
  const combinedText = normalizedText(assignments.map((assignment) => assignment.text).join(" "))
  const mismatched = assignments.some(
    (assignment) =>
      assignment.pageId !== entry.pageId ||
      assignment.headingLevel !== entry.level ||
      assignment.headingStyleClusterId !== entry.styleClusterId ||
      assignment.role !== expectedRole(entry.level),
  )
  return mismatched || combinedText !== normalizedText(entry.title) ? "mismatch" : "assigned"
}

function statusStyle(state: OutlineAssignmentState): string {
  if (state === "assigned") return "border-emerald-200 bg-emerald-50 text-emerald-700"
  if (state === "mismatch") return "border-amber-200 bg-amber-50 text-amber-700"
  return "border-rose-200 bg-rose-50 text-rose-700"
}

export function BookOutlineAudit({
  bookLabel,
  onNavigateToPage,
}: {
  bookLabel: string
  onNavigateToPage: (pageId: string) => void
}) {
  const { t } = useLingui()
  const { data, isLoading, error } = useBookOutlineAudit(bookLabel)
  const [query, setQuery] = useState("")
  const [issuesOnly, setIssuesOnly] = useState(false)

  const kindLabels: Record<HeadingKind, string> = {
    part: t`Part`,
    chapter: t`Chapter`,
    section: t`Section`,
    subsection: t`Subsection`,
    activity: t`Activity`,
    callout: t`Callout`,
    other: t`Other`,
  }

  const view = useMemo(() => {
    if (!data) return null
    const byOutlineId = new Map<string, BookOutlineAppliedHeading[]>()
    for (const assignment of data.appliedHeadings) {
      const current = byOutlineId.get(assignment.outlineEntryId) ?? []
      current.push(assignment)
      byOutlineId.set(assignment.outlineEntryId, current)
    }
    const entries = data.outline.entries.map((entry) => {
      const assignments = byOutlineId.get(entry.outlineId) ?? []
      return { entry, assignments, state: outlineAssignmentState(entry, assignments) }
    })
    const normalizedQuery = query.trim().toLocaleLowerCase()
    return {
      entries: entries.filter(({ entry, state }) => {
        if (issuesOnly && state === "assigned") return false
        if (!normalizedQuery) return true
        return (
          entry.title.toLocaleLowerCase().includes(normalizedQuery) ||
          entry.outlineId.toLocaleLowerCase().includes(normalizedQuery) ||
          entry.styleClusterId.toLocaleLowerCase().includes(normalizedQuery)
        )
      }),
      assigned: entries.filter(({ state }) => state === "assigned").length,
      issues: entries.filter(({ state }) => state !== "assigned").length,
    }
  }, [data, issuesOnly, query])

  if (isLoading) {
    return <div className="p-6 text-sm text-muted-foreground"><Trans>Loading book outline...</Trans></div>
  }
  if (error) {
    return <div className="p-6 text-sm text-destructive"><Trans>Could not load the book outline.</Trans></div>
  }
  if (!data || !view) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        <Trans>No book outline has been extracted yet.</Trans>
      </div>
    )
  }

  return (
    <div className="h-full overflow-auto bg-muted/20">
      <div className="mx-auto max-w-6xl space-y-4 p-5">
        <div className="rounded-lg border bg-card p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold"><Trans>Book heading outline</Trans></h2>
                <span className="rounded border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  <Trans>Version {String(data.version)}</Trans>
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                <Trans>Review each heading’s level, page, confidence, style cluster, and storyboard assignment.</Trans>
              </p>
            </div>
            <div className="flex gap-2 text-xs">
              <span className="inline-flex items-center gap-1 rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-emerald-700">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <Trans>{String(view.assigned)} assigned</Trans>
              </span>
              <span className="inline-flex items-center gap-1 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-amber-700">
                <AlertTriangle className="h-3.5 w-3.5" />
                <Trans>{String(view.issues)} issues</Trans>
              </span>
            </div>
          </div>

          <details className="mt-3 text-xs text-muted-foreground">
            <summary className="cursor-pointer font-medium text-foreground"><Trans>Model reasoning</Trans></summary>
            <p className="mt-2 whitespace-pre-wrap leading-relaxed">{data.outline.reasoning}</p>
          </details>
        </div>

        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3">
          <div className="relative min-w-56 flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t`Search headings, IDs, or style clusters...`}
              className="h-8 w-full rounded-md border bg-background pl-8 pr-3 text-xs outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <button
            type="button"
            onClick={() => setIssuesOnly((value) => !value)}
            className={cn(
              "h-8 rounded-md border px-3 text-xs transition-colors",
              issuesOnly ? "border-amber-300 bg-amber-50 text-amber-800" : "bg-background hover:bg-muted",
            )}
          >
            <Trans>Issues only</Trans>
          </button>
        </div>

        <div className="overflow-hidden rounded-lg border bg-card">
          {view.entries.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              <Trans>No outline entries match the current filter.</Trans>
            </div>
          ) : (
            view.entries.map(({ entry, assignments, state }) => {
              const cluster = data.outline.styleClusters.find(
                (candidate) => candidate.styleClusterId === entry.styleClusterId,
              )
              return (
                <div key={entry.outlineId} className="border-b last:border-b-0">
                  <button
                    type="button"
                    onClick={() => onNavigateToPage(entry.pageId)}
                    className="flex w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-muted/50"
                    style={{ paddingLeft: `${12 + (entry.level - 1) * 24}px` }}
                  >
                    <span className="flex h-7 w-9 shrink-0 items-center justify-center rounded bg-violet-100 text-xs font-semibold text-violet-700">
                      H{entry.level}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{entry.title}</div>
                      <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                        <span>{kindLabels[entry.kind]}</span>
                        <span><Trans>Page {String(entry.pageNumber)}</Trans></span>
                        <span>{Math.round(entry.confidence * 100)}% <Trans>confidence</Trans></span>
                        <span title={cluster?.description}>{entry.styleClusterId}</span>
                      </div>
                    </div>
                    <span className={cn("rounded border px-2 py-1 text-[10px] font-medium", statusStyle(state))}>
                      {state === "assigned" ? t`Assigned` : state === "mismatch" ? t`Mismatch` : t`Missing`}
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </button>
                  <details className="border-t bg-muted/20 px-4 py-2 text-[11px] text-muted-foreground">
                    <summary className="cursor-pointer"><Trans>Assignment evidence</Trans></summary>
                    <div className="mt-2 grid gap-1 pl-2">
                      <span><Trans>Outline ID:</Trans> {entry.outlineId}</span>
                      <span><Trans>Parent:</Trans> {entry.parentId ?? t`None`}</span>
                      <span><Trans>Source candidates:</Trans> {entry.sourceCandidateIds.join(", ")}</span>
                      <span>
                        <Trans>Storyboard nodes:</Trans>{" "}
                        {assignments.length > 0
                          ? assignments.map((assignment) => assignment.nodeId).join(", ")
                          : t`None`}
                      </span>
                      {cluster && <span><Trans>Style:</Trans> {cluster.description}</span>}
                    </div>
                  </details>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
