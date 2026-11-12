import { Fragment, useMemo } from "react"
import type { AccessibilityFinding, AccessibilityPageResult } from "@adt/types"
import { Trans, useLingui } from "@lingui/react/macro"
import type { PageAccessibilitySummary } from "@/lib/accessibility-summary"
import { useAxeRuleTranslator } from "@/lib/axe-rule-locale"
import { ExternalLink } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

const SEVERITY_ORDER = ["critical", "serious", "moderate", "minor", "unknown"] as const
const REVIEW_BORDER = "border-sky-500"
type Severity = typeof SEVERITY_ORDER[number]

const SEVERITY_RANK: Record<string, number> = {
  critical: 0,
  serious: 1,
  moderate: 2,
  minor: 3,
  unknown: 4,
}

const SEVERITY_BORDER: Record<Severity, string> = {
  critical: "border-red-500",
  serious: "border-orange-500",
  moderate: "border-yellow-500",
  minor: "border-blue-500",
  unknown: "border-gray-400",
}

const FINDING_HOVER_BORDER: Record<Severity, string> = {
  critical: "hover:border-red-400/70",
  serious: "hover:border-orange-400/70",
  moderate: "hover:border-yellow-400/80",
  minor: "hover:border-blue-400/70",
  unknown: "hover:border-gray-400/70",
}

function getFindingSeverity(impact: string | null | undefined): Severity {
  if (impact === "critical" || impact === "serious" || impact === "moderate" || impact === "minor") {
    return impact
  }

  return "unknown"
}

function computeSeverityCounts(page: AccessibilityPageResult): Record<Severity, number> {
  const counts: Record<Severity, number> = { critical: 0, serious: 0, moderate: 0, minor: 0, unknown: 0 }
  for (const finding of page.violations) {
    const key = (finding.impact && finding.impact in counts ? finding.impact : "unknown") as Severity
    counts[key]++
  }
  return counts
}

function sortFindings(findings: AccessibilityFinding[]): AccessibilityFinding[] {
  return [...findings].sort((a, b) => {
    const rankA = SEVERITY_RANK[a.impact ?? "unknown"] ?? 4
    const rankB = SEVERITY_RANK[b.impact ?? "unknown"] ?? 4
    if (rankA !== rankB) return rankA - rankB
    return b.nodes.length - a.nodes.length
  })
}

interface AccessibilityCurrentPagePanelProps {
  page: AccessibilityPageResult | null
  summary: PageAccessibilitySummary | null
  emptyMessage?: string
  className?: string
  embedded?: boolean
  onFindingHover?: (finding: AccessibilityFinding | null) => void
}

const URL_PATTERN = /https?:\/\/[^\s<>"']+/g

function splitTrailingPunctuation(url: string) {
  const match = url.match(/[),.;:!?]+$/)
  if (!match) {
    return { href: url, trailing: "" }
  }

  return {
    href: url.slice(0, -match[0].length),
    trailing: match[0],
  }
}

function LinkifiedText({
  text,
  className,
  preserveWhitespace = false,
}: {
  text: string
  className?: string
  preserveWhitespace?: boolean
}) {
  const matches = [...text.matchAll(URL_PATTERN)]

  if (matches.length === 0) {
    return <div className={className}>{text}</div>
  }

  let lastIndex = 0

  return (
    <div className={className}>
      {matches.map((match, index) => {
        const rawUrl = match[0]
        const start = match.index ?? 0
        const before = text.slice(lastIndex, start)
        const { href, trailing } = splitTrailingPunctuation(rawUrl)
        lastIndex = start + rawUrl.length

        return (
          <Fragment key={`${href}-${index}`}>
            {before}
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className={cn(
                "break-all text-foreground underline underline-offset-2 hover:text-primary",
                preserveWhitespace ? "whitespace-pre-wrap" : undefined,
              )}
              onClick={(event) => event.stopPropagation()}
            >
              {href}
            </a>
            {trailing}
          </Fragment>
        )
      })}
      {text.slice(lastIndex)}
    </div>
  )
}

function SeverityLabel({ severity }: { severity: Severity }) {
  switch (severity) {
    case "critical":
      return <Trans>critical</Trans>
    case "serious":
      return <Trans>serious</Trans>
    case "moderate":
      return <Trans>moderate</Trans>
    case "minor":
      return <Trans>minor</Trans>
    default:
      return <Trans>unknown</Trans>
  }
}

function FindingCard({
  finding,
  reviewOnly = false,
  onFindingHover,
}: {
  finding: AccessibilityFinding
  reviewOnly?: boolean
  /** Fires on enter and on every move over a finding, so it must be idempotent. */
  onFindingHover?: (finding: AccessibilityFinding | null) => void
}) {
  const { t } = useLingui()
  const axeRules = useAxeRuleTranslator()
  const severity = getFindingSeverity(finding.impact)

  return (
    <div
      className={cn(
        "space-y-2 rounded-xl border bg-card/80 px-3 py-3 transition-colors",
        reviewOnly ? "border-sky-200 hover:border-sky-400/70" : FINDING_HOVER_BORDER[severity],
      )}
      onMouseEnter={() => onFindingHover?.(finding)}
      onMouseMove={() => onFindingHover?.(finding)}
      onMouseLeave={() => onFindingHover?.(null)}
    >
      <div className="flex flex-wrap items-center gap-2">
        {reviewOnly ? (
          <Badge className="border-0 bg-sky-100 text-[11px] text-sky-900 hover:bg-sky-100 dark:bg-sky-950/60 dark:text-sky-200">
            <Trans>Manual review</Trans>
          </Badge>
        ) : (
          <Badge
            className={cn(
              "border-0 text-[11px] capitalize",
              finding.impact === "critical" ? "bg-red-500 text-white"
                : finding.impact === "serious" ? "bg-orange-500 text-white"
                : finding.impact === "moderate" ? "bg-yellow-400 text-yellow-950"
                : finding.impact === "minor" ? "bg-blue-400 text-white"
                : "bg-gray-400 text-white",
            )}
          >
            <SeverityLabel severity={severity} />
          </Badge>
        )}
      </div>
      <div className="flex items-start justify-between gap-2">
        <div className="text-sm font-medium leading-snug">{axeRules.help(finding.id, finding.help)}</div>
        {finding.helpUrl ? (
          <a href={finding.helpUrl} target="_blank" rel="noopener noreferrer" className="shrink-0">
            <code className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground hover:text-foreground">
              {finding.id}
              <ExternalLink className="h-2.5 w-2.5" />
            </code>
          </a>
        ) : null}
      </div>
      <LinkifiedText text={axeRules.description(finding.id, finding.description)} className="text-xs leading-relaxed text-muted-foreground" />
      {finding.nodes.length > 0 ? (
        <div className="space-y-1.5">
          <div className="text-xs font-medium text-muted-foreground"><Trans>Nodes</Trans></div>
          {finding.nodes.map((node, nodeIndex) => (
            <div key={`${finding.id}-${nodeIndex}`} className="rounded-lg bg-muted/40 px-2.5 py-2 text-xs font-mono">
              <div>{node.target.join(", ") || t`(no target)`}</div>
              {node.failureSummary ? (
                <LinkifiedText
                  text={node.failureSummary}
                  className="mt-1 whitespace-pre-wrap font-sans leading-relaxed text-muted-foreground"
                  preserveWhitespace
                />
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function FindingsSection({
  title,
  description,
  findings,
  reviewOnly = false,
  onFindingHover,
}: {
  title: React.ReactNode
  description: React.ReactNode
  findings: AccessibilityFinding[]
  reviewOnly?: boolean
  onFindingHover?: (finding: AccessibilityFinding | null) => void
}) {
  if (findings.length === 0) {
    return null
  }

  return (
    <section className="space-y-3">
      <div className="space-y-1">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</div>
        <div className="text-xs leading-relaxed text-muted-foreground">{description}</div>
      </div>
      <div className="space-y-3">
        {findings.map((finding, index) => (
          <FindingCard
            key={`${reviewOnly ? "review" : "issue"}:${finding.id}-${index}`}
            finding={finding}
            reviewOnly={reviewOnly}
            onFindingHover={onFindingHover}
          />
        ))}
      </div>
    </section>
  )
}

function FindingsList({ page, embedded = false, onFindingHover }: { page: AccessibilityPageResult; embedded?: boolean; onFindingHover?: (finding: AccessibilityFinding | null) => void }) {
  const issues = useMemo(() => sortFindings(page.violations), [page.violations])
  const manualReview = useMemo(() => sortFindings(page.incomplete), [page.incomplete])
  const hasFindings = issues.length > 0 || manualReview.length > 0

  return (
    <div className={cn("space-y-3", embedded ? "" : "border-t px-4 py-4")}>
      {page.error ? (
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {page.error}
        </div>
      ) : !hasFindings ? (
        <div className="px-3 py-2 text-sm text-muted-foreground">
          <Trans>No accessibility findings were reported for this page.</Trans>
        </div>
      ) : (
        <div className="space-y-4">
          <FindingsSection
            title={<Trans>Issues</Trans>}
            description={null}
            findings={issues}
            onFindingHover={onFindingHover}
          />
          <FindingsSection
            title={<Trans>Manual review</Trans>}
            description={<Trans>Axe could not fully evaluate these checks in preview. Verify them in-browser or by inspection.</Trans>}
            findings={manualReview}
            reviewOnly
            onFindingHover={onFindingHover}
          />
        </div>
      )}
    </div>
  )
}

export function AccessibilityCurrentPagePanel({
  page,
  summary,
  emptyMessage,
  className = "",
  embedded = false,
  onFindingHover,
}: AccessibilityCurrentPagePanelProps) {
  const { t } = useLingui()
  const resolvedEmptyMessage = emptyMessage ?? t`Open a page in Preview to show its page-specific accessibility findings here.`

  if (!page || !summary) {
    return (
      <div className={cn(embedded ? "rounded-2xl border bg-card/70 px-3 py-3" : "rounded-xl border bg-card p-4", className)}>
        <div className="rounded-lg border border-dashed px-4 py-4 text-sm text-muted-foreground">
          {resolvedEmptyMessage}
        </div>
      </div>
    )
  }

  const severityCounts = computeSeverityCounts(page)
  const summaryTiles = [
    summary.issueCount > 0 ? (
      <div key="issues" className={cn("min-w-[4.5rem] rounded-lg border-2 px-3 py-2", embedded ? "" : "min-w-[5rem]", "border-orange-500")}>
        <div className="text-[11px] text-muted-foreground"><Trans>Issues</Trans></div>
        <div className={cn(embedded ? "text-lg" : "text-xl", "font-semibold tabular-nums")}>{summary.issueCount}</div>
      </div>
    ) : null,
    summary.reviewCount > 0 ? (
      <div key="manual-review" className={cn("min-w-[4.5rem] rounded-lg border-2 px-3 py-2", embedded ? "" : "min-w-[5rem]", REVIEW_BORDER)}>
        <div className="text-[11px] text-muted-foreground"><Trans>Manual review</Trans></div>
        <div className={cn(embedded ? "text-lg" : "text-xl", "font-semibold tabular-nums")}>{summary.reviewCount}</div>
      </div>
    ) : null,
  ].filter(Boolean)

  const severityTiles = SEVERITY_ORDER.filter((severity) => severityCounts[severity] > 0).map((severity) => (
    <div key={severity} className={cn("min-w-[4.5rem] rounded-lg border-2 px-3 py-2", embedded ? "" : "min-w-[5rem]", SEVERITY_BORDER[severity])}>
      <div className="text-[11px] text-muted-foreground capitalize"><SeverityLabel severity={severity} /></div>
      <div className={cn(embedded ? "text-lg" : "text-xl", "font-semibold tabular-nums")}>{severityCounts[severity]}</div>
    </div>
  ))

  if (embedded) {
    return (
      <div className={cn("space-y-3", className)}>
        <div className="space-y-3 rounded-2xl border bg-card/70 px-3.5 py-3.5">
          {summaryTiles.length > 0 || severityTiles.length > 0 ? <div className="flex flex-wrap gap-2">{summaryTiles}{severityTiles}</div> : null}
          <FindingsList page={page} embedded onFindingHover={onFindingHover} />
        </div>
      </div>
    )
  }

  return (
    <div className={cn("overflow-hidden rounded-xl border bg-card", className)}>
      <div className="space-y-4 px-4 py-4">
        {summaryTiles.length > 0 || severityTiles.length > 0 ? <div className="flex flex-wrap gap-2">{summaryTiles}{severityTiles}</div> : null}
        <FindingsList page={page} embedded onFindingHover={onFindingHover} />
      </div>
    </div>
  )
}
