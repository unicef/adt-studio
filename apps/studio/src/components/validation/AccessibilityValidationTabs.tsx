import { useEffect, useMemo, useState } from "react"
import type { I18n } from "@lingui/core"
import { msg } from "@lingui/core/macro"
import { Trans, useLingui } from "@lingui/react/macro"
import type { AccessibilityCategoryKey, AccessibilitySeverity } from "@/lib/accessibility-summary"
import { ExternalLink } from "lucide-react"
import { useNavigate } from "@tanstack/react-router"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useBookConfig, useUpdateBookConfig } from "@/hooks/use-book-config"
import { useAccessibilityAssessment } from "@/hooks/use-debug"
import { buildAccessibilityOverview, buildFrequentAccessibilityFindings, getAccessibilityCategoryLabel } from "@/lib/accessibility-summary"
import { useAxeRuleTranslator } from "@/lib/axe-rule-locale"
import { cn } from "@/lib/utils"

interface AccessibilityTabProps {
  label: string
  /** Overrides where a finding's page link goes. The redesign pipeline passes
   *  its own preview route so the link does not escape into the legacy UI. */
  onOpenPage?: (href: string) => void
}

const SEVERITY_ORDER: AccessibilitySeverity[] = ["critical", "serious", "moderate", "minor", "unknown"]
const SEVERITY_RANK: Record<AccessibilitySeverity, number> = {
  critical: 0,
  serious: 1,
  moderate: 2,
  minor: 3,
  unknown: 4,
}

function SeverityLabel({ severity }: { severity: AccessibilitySeverity }) {
  switch (severity) {
    case "critical":
      return <Trans>Critical</Trans>
    case "serious":
      return <Trans>Serious</Trans>
    case "moderate":
      return <Trans>Moderate</Trans>
    case "minor":
      return <Trans>Minor</Trans>
    default:
      return <Trans>Unknown</Trans>
  }
}

function SummaryCard({
  label,
  value,
  tone = "default",
  active = false,
  onClick,
}: {
  label: React.ReactNode
  value: number | string
  tone?: "default" | "error" | "warning" | "caution" | "success" | "info" | "muted"
  active?: boolean
  onClick?: () => void
}) {
  const toneClass =
    tone === "error"
      ? "border-red-500 bg-muted/40"
      : tone === "warning"
        ? "border-orange-500 bg-muted/40"
        : tone === "caution"
          ? "border-yellow-500 bg-muted/40"
          : tone === "success"
            ? "border-emerald-500 bg-muted/40"
            : tone === "info"
              ? "border-blue-500 bg-muted/40"
              : tone === "muted"
                ? "border-gray-400 bg-muted/40"
                : "bg-card"

  const classes = cn(
    "min-w-[7rem] rounded-lg border-2 px-3 py-2 text-left transition-colors",
    toneClass,
    onClick ? "cursor-pointer hover:border-primary/40 hover:bg-muted/60" : "",
    active ? "ring-2 ring-primary/35 border-primary/40" : "",
  )

  const content = (
    <>
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
    </>
  )

  if (onClick) {
    return (
      <button type="button" className={classes} onClick={onClick}>
        {content}
      </button>
    )
  }

  return <div className={classes}>{content}</div>
}

function SectionHeader({
  title,
  description,
  action,
}: {
  title: React.ReactNode
  description: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-border/60 pb-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}

function LoadingState({ message }: { message: React.ReactNode }) {
  return <div className="p-6 text-sm text-muted-foreground">{message}</div>
}

function ErrorState({ message }: { message: React.ReactNode }) {
  return (
    <div className="p-6">
      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        {message}
      </div>
    </div>
  )
}

function EmptyState({ message }: { message: React.ReactNode }) {
  return <div className="p-6 text-sm text-muted-foreground">{message}</div>
}


function formatFindingPageLabel(i18n: I18n, page: { pageNumber: number | null; title: string | null; href: string }): string {
  if (page.pageNumber != null) {
    return i18n._(msg`Page ${page.pageNumber}`)
  }
  if (page.title) {
    return page.title
  }
  return page.href
}

function FindingPageLinks({
  pages,
  onOpenPage,
}: {
  pages: Array<{ sectionId: string; href: string; title: string | null; pageNumber: number | null; count: number }>
  onOpenPage: (href: string) => void
}) {
  const { t, i18n } = useLingui()
  const [expanded, setExpanded] = useState(false)
  const visiblePages = expanded ? pages : pages.slice(0, 6)

  return (
    <div className="mt-3 space-y-2">
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground"><Trans>Affected pages</Trans></div>
      <div className="flex flex-wrap gap-2">
        {visiblePages.map((page) => (
          <Button
            key={page.sectionId}
            variant="outline"
            size="sm"
            className="h-7 px-2.5 text-[11px]"
            onClick={() => onOpenPage(page.href)}
          >
            {formatFindingPageLabel(i18n, page)}
            {page.count > 1 ? <span className="ml-1 text-muted-foreground">({page.count})</span> : null}
          </Button>
        ))}
        {pages.length > 6 ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2.5 text-[11px]"
            onClick={() => setExpanded((open) => !open)}
          >
            {expanded ? t`Show fewer` : t`Show all ${pages.length}`}
          </Button>
        ) : null}
      </div>
    </div>
  )
}

function FrequentFindingCard({
  finding,
  pageCount,
  onOpenPage,
  onFilterSeverity,
  onFilterCategory,
}: {
  finding: ReturnType<typeof buildFrequentAccessibilityFindings>[number]
  pageCount: number
  onOpenPage: (href: string) => void
  onFilterSeverity: (severity: AccessibilitySeverity) => void
  onFilterCategory: (category: AccessibilityCategoryKey) => void
}) {
  const { t, i18n } = useLingui()
  const axeRules = useAxeRuleTranslator()
  const coveragePercent = Math.round(finding.pageCoverage * 100)
  const count = finding.count

  return (
    <div className="rounded-lg border px-3 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {finding.reviewOnly ? (
            <Badge className="bg-sky-100 text-[11px] text-sky-900 hover:bg-sky-100 dark:bg-sky-950/60 dark:text-sky-200">
              <Trans>Manual review</Trans>
            </Badge>
          ) : (
            <Badge
              className={cn(
                "cursor-pointer text-[11px]",
                finding.impact === "critical" ? "bg-red-500 text-white hover:bg-red-600"
                  : finding.impact === "serious" ? "bg-orange-500 text-white hover:bg-orange-600"
                  : finding.impact === "moderate" ? "bg-yellow-400 text-yellow-950 hover:bg-yellow-500"
                  : finding.impact === "minor" ? "bg-blue-400 text-white hover:bg-blue-500"
                  : "bg-gray-400 text-white hover:bg-gray-500",
              )}
              onClick={() => onFilterSeverity(finding.impact)}
            >
              <SeverityLabel severity={finding.impact} />
            </Badge>
          )}
          <Badge
            variant="outline"
            className="cursor-pointer text-[11px] hover:bg-muted"
            onClick={() => onFilterCategory(finding.categoryKey)}
          >
            {getAccessibilityCategoryLabel(i18n, finding.categoryKey)}
          </Badge>
        </div>
        <div className="text-sm font-semibold tabular-nums">{finding.reviewOnly ? t`${count} {count, plural, one {manual review item} other {manual review items}}` : t`${count} {count, plural, one {issue} other {issues}}`}</div>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="font-medium">{axeRules.help(finding.id, finding.help)}</span>
        {finding.helpUrl ? (
          <a href={finding.helpUrl} target="_blank" rel="noopener noreferrer" className="inline-flex shrink-0 items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground">
            <code>{finding.id}</code>
            <ExternalLink className="h-3 w-3" />
          </a>
        ) : (
          <code className="shrink-0 text-[11px] text-muted-foreground">{finding.id}</code>
        )}
      </div>
      <div className="mt-1 text-xs text-muted-foreground">{axeRules.description(finding.id, finding.description)}</div>

      <div className="mt-3 space-y-1">
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span><Trans>Page coverage</Trans></span>
          <span>{coveragePercent}%</span>
        </div>
        <div className="h-2 rounded-full bg-muted">
          <div
            className={cn(
              "h-2 rounded-full",
              finding.impact === "critical" ? "bg-red-500"
                : finding.impact === "serious" ? "bg-orange-500"
                : finding.impact === "moderate" ? "bg-yellow-400"
                : finding.impact === "minor" ? "bg-blue-400"
                : "bg-gray-400",
            )}
            style={{ width: `${Math.max(8, coveragePercent)}%` }}
          />
        </div>
      </div>

      <FindingPageLinks pages={finding.pages} onOpenPage={onOpenPage} />
    </div>
  )
}



export function AccessibilityOverviewTab({ label, onOpenPage }: AccessibilityTabProps) {
  const { t, i18n } = useLingui()
  const navigate = useNavigate()
  const { data, isLoading, error } = useAccessibilityAssessment(label)
  const [severityFilter, setSeverityFilter] = useState<AccessibilitySeverity | null>(null)
  const [categoryFilter, setCategoryFilter] = useState<AccessibilityCategoryKey | null>(null)

  if (isLoading) {
    return <LoadingState message={<Trans>Loading accessibility summary...</Trans>} />
  }

  if (error) {
    return <ErrorState message={t`Failed to load accessibility results: ${error.message}`} />
  }

  if (!data?.assessment) {
    return <EmptyState message={<Trans>No accessibility assessment has been generated yet. Package the ADT output to create one.</Trans>} />
  }

  const assessment = data.assessment
  const overview = buildAccessibilityOverview(assessment)
  const allFindings = buildFrequentAccessibilityFindings(assessment, { limit: 100 })
    .sort((a, b) => {
      const severityDiff = SEVERITY_RANK[a.impact] - SEVERITY_RANK[b.impact]
      if (severityDiff !== 0) return severityDiff
      return b.pagesAffected - a.pagesAffected
    })

  let totalObservations = 0
  for (const finding of allFindings) {
    totalObservations += finding.count
  }

  const issueFindings = allFindings.filter((finding) => !finding.reviewOnly)

  // Severity counts filtered by active category filter; manual-review items are excluded.
  const severityCounts: Record<AccessibilitySeverity, number> = { critical: 0, serious: 0, moderate: 0, minor: 0, unknown: 0 }
  const severityFiltered = categoryFilter ? issueFindings.filter((finding) => finding.categoryKey === categoryFilter) : issueFindings
  for (const finding of severityFiltered) {
    severityCounts[finding.impact] += finding.count
  }

  // Category counts filtered by active severity filter.
  const categoryCounts = new Map<AccessibilityCategoryKey, number>()
  const categoryFiltered = severityFilter ? issueFindings.filter((finding) => finding.impact === severityFilter) : allFindings
  for (const finding of categoryFiltered) {
    categoryCounts.set(finding.categoryKey, (categoryCounts.get(finding.categoryKey) ?? 0) + finding.count)
  }

  const visibleFindings = allFindings.filter((finding) => {
    if (severityFilter) {
      if (finding.reviewOnly || finding.impact !== severityFilter) return false
    }
    if (categoryFilter && finding.categoryKey !== categoryFilter) return false
    return true
  })
  const visibleFindingsUniverse = severityFilter ? issueFindings : allFindings

  const hasActiveFilter = severityFilter !== null || categoryFilter !== null

  const openPreviewToPage =
    onOpenPage ??
    ((href: string) => {
      void navigate({
        to: "/books/$label/$step",
        params: { label, step: "preview" },
        search: { previewHref: href },
      })
    })

  const activeSeverityLabel = severityFilter ? <SeverityLabel severity={severityFilter} /> : null
  const activeCategoryLabel = categoryFilter
    ? getAccessibilityCategoryLabel(i18n, categoryFilter)
    : null

  return (
    <div className="p-6">
      <div className="rounded-t-xl border border-b-0 bg-card p-4 space-y-4">
        <div className="flex flex-wrap gap-3">
          <SummaryCard
            label={t`Issues`}
            value={assessment.summary.violationCount}
            tone={assessment.summary.violationCount > 0 ? "warning" : "default"}
          />
          <SummaryCard
            label={t`Manual review`}
            value={assessment.summary.incompleteCount}
            tone={assessment.summary.incompleteCount > 0 ? "info" : "default"}
          />
          <SummaryCard
            label={t`All Severities`}
            value={severityFiltered.reduce((sum, f) => sum + f.count, 0)}
            tone="default"
            active={severityFilter === null}
            onClick={() => setSeverityFilter(null)}
          />
          {SEVERITY_ORDER.map((severity) => {
            const count = severityCounts[severity]
            if (severity === "unknown" && count === 0) return null
            const SEVERITY_TONES: Record<AccessibilitySeverity, "error" | "warning" | "caution" | "info" | "muted"> = {
              critical: "error",
              serious: "warning",
              moderate: "caution",
              minor: "info",
              unknown: "muted",
            }
            return (
              <SummaryCard
                key={severity}
                label={<SeverityLabel severity={severity} />}
                value={count}
                tone={SEVERITY_TONES[severity]}
                active={severityFilter === severity}
                onClick={count > 0 ? () => setSeverityFilter(severity) : undefined}
              />
            )
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setCategoryFilter(null)}
            className={cn(
              "inline-flex items-center rounded-md border px-2.5 py-1 text-[11px] transition-colors",
              categoryFilter === null
                ? "border-primary/35 bg-primary/10 text-primary ring-1 ring-primary/20"
                : "border-border bg-background hover:border-primary/30 hover:bg-muted",
            )}
          >
            <Trans>All Categories</Trans>
            <span className="ml-1 text-muted-foreground">{categoryFiltered.reduce((sum, f) => sum + f.count, 0)}</span>
          </button>
          {overview.categories.map((category) => (
            <button
              key={category.key}
              type="button"
              onClick={() => setCategoryFilter(category.key)}
              className={cn(
                "inline-flex items-center rounded-md border px-2.5 py-1 text-[11px] transition-colors",
                categoryFilter === category.key
                  ? "border-primary/35 bg-primary/10 text-primary ring-1 ring-primary/20"
                  : "border-border bg-background hover:border-primary/30 hover:bg-muted",
              )}
            >
              {getAccessibilityCategoryLabel(i18n, category.key)}
              <span className="ml-1 text-muted-foreground">{categoryCounts.get(category.key) ?? 0}</span>
            </button>
          ))}
          {overview.categories.length === 0 ? (
            <span className="text-xs text-muted-foreground"><Trans>No finding categories reported.</Trans></span>
          ) : null}
        </div>
      </div>

      <div className="flex h-9 items-center justify-between border-x border-b bg-muted/40 px-4">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {hasActiveFilter ? (
            <>
              <span><Trans>Filtered by:</Trans></span>
              {activeSeverityLabel ? (
                <Badge
                  variant="secondary"
                  className="cursor-pointer gap-1 text-[11px]"
                  onClick={() => setSeverityFilter(null)}
                >
                  {activeSeverityLabel}
                  <span className="text-muted-foreground/60">&times;</span>
                </Badge>
              ) : null}
              {activeCategoryLabel ? (
                <Badge
                  variant="secondary"
                  className="cursor-pointer gap-1 text-[11px]"
                  onClick={() => setCategoryFilter(null)}
                >
                  {activeCategoryLabel}
                  <span className="text-muted-foreground/60">&times;</span>
                </Badge>
              ) : null}
              <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px]" onClick={() => { setSeverityFilter(null); setCategoryFilter(null) }}>
                <Trans>Clear all</Trans>
              </Button>
            </>
          ) : (
            <span><Trans>All issues and manual review items</Trans></span>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground tabular-nums">
          {visibleFindings.length === visibleFindingsUniverse.length
            ? t`${visibleFindingsUniverse.length} items`
            : t`${visibleFindings.length} of ${visibleFindingsUniverse.length} items`}
        </p>
      </div>

      <div className="rounded-b-xl border border-t-0 p-4 space-y-3">
        {visibleFindings.length > 0 ? (
          visibleFindings.map((finding) => (
            <FrequentFindingCard
              key={`${finding.reviewOnly ? "review" : "violation"}:${finding.id}`}
              finding={finding}
              pageCount={assessment.summary.pageCount}
              onOpenPage={openPreviewToPage}
              onFilterSeverity={(severity) => setSeverityFilter(severity)}
              onFilterCategory={(category) => setCategoryFilter(category)}
            />
          ))
        ) : (
          <div className="rounded-lg border border-dashed px-4 py-4 text-sm text-muted-foreground">
            {hasActiveFilter ? t`No issues or manual review items match the current filters.` : t`No issues or manual review items were reported.`}
          </div>
        )}
      </div>
    </div>
  )
}

export function AccessibilityConfigTab({ label }: AccessibilityTabProps) {
  const { t } = useLingui()
  const [runOnlyTagsInput, setRunOnlyTagsInput] = useState("")
  const [disabledRulesInput, setDisabledRulesInput] = useState("")
  const [configDirty, setConfigDirty] = useState(false)

  const { data } = useAccessibilityAssessment(label)
  const { data: bookConfigData } = useBookConfig(label)
  const updateConfig = useUpdateBookConfig()

  useEffect(() => {
    if (!data?.assessment || configDirty) {
      return
    }

    const bookConfig = (bookConfigData?.config ?? {}) as Record<string, unknown>
    const existing = bookConfig.accessibility_assessment && typeof bookConfig.accessibility_assessment === "object"
      ? bookConfig.accessibility_assessment as Record<string, unknown>
      : null

    setRunOnlyTagsInput(
      stringifyList(
        Array.isArray(existing?.run_only_tags)
          ? existing.run_only_tags as string[]
          : data.assessment.runOnlyTags,
      ),
    )
    setDisabledRulesInput(
      stringifyList(
        Array.isArray(existing?.disabled_rules)
          ? existing.disabled_rules as string[]
          : data.assessment.disabledRules,
      ),
    )
  }, [bookConfigData?.config, configDirty, data?.assessment])

  const hasOverride = useMemo(() => {
    const bookConfig = (bookConfigData?.config ?? {}) as Record<string, unknown>
    return Boolean(
      bookConfig.accessibility_assessment
      && typeof bookConfig.accessibility_assessment === "object",
    )
  }, [bookConfigData?.config])

  const saveConfig = () => {
    const currentConfig = { ...(bookConfigData?.config ?? {}) } as Record<string, unknown>
    currentConfig.accessibility_assessment = {
      run_only_tags: parseList(runOnlyTagsInput),
      disabled_rules: parseList(disabledRulesInput),
    }
    updateConfig.mutate({ label, config: currentConfig })
    setConfigDirty(false)
  }

  const resetConfig = () => {
    const currentConfig = { ...(bookConfigData?.config ?? {}) } as Record<string, unknown>
    delete currentConfig.accessibility_assessment
    updateConfig.mutate({ label, config: currentConfig })
    setConfigDirty(false)
  }

  return (
    <div className="space-y-6 p-6">
      <SectionHeader
        title={t`Accessibility assessment configuration`}
        description={t`Control which axe checks run during packaging for this document. Changes apply on the next package run.`}
      />

      <div className="rounded-xl border bg-card p-4">
        <div className="grid gap-5 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="run-only-tags"><Trans>Enabled axe tags</Trans></Label>
            <Textarea
              id="run-only-tags"
              value={runOnlyTagsInput}
              onChange={(event) => {
                setRunOnlyTagsInput(event.target.value)
                setConfigDirty(true)
              }}
              placeholder={t`wcag2a\nwcag2aa\nbest-practice`}
              className="min-h-40 font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">
              <Trans>One tag per line or comma-separated. Leave as-is to keep the current package defaults.</Trans>
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="disabled-rules"><Trans>Disabled axe rules</Trans></Label>
            <Textarea
              id="disabled-rules"
              value={disabledRulesInput}
              onChange={(event) => {
                setDisabledRulesInput(event.target.value)
                setConfigDirty(true)
              }}
              placeholder={t`color-contrast`}
              className="min-h-40 font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">
              <Trans>Use this for checks you intentionally want to suppress, such as known false positives.</Trans>
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            className="h-8 text-xs"
            onClick={saveConfig}
            disabled={updateConfig.isPending}
          >
            <Trans>Save settings</Trans>
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={resetConfig}
            disabled={updateConfig.isPending || !hasOverride}
          >
            <Trans>Reset to defaults</Trans>
          </Button>
          {updateConfig.isSuccess ? (
            <span className="text-xs text-emerald-700 dark:text-emerald-400">
              <Trans>Saved. Re-package Preview to apply.</Trans>
            </span>
          ) : null}
          {updateConfig.isError ? (
            <span className="text-xs text-red-700">{updateConfig.error.message}</span>
          ) : null}
        </div>
      </div>

      <div className="rounded-xl border bg-card p-4">
        <h4 className="text-sm font-medium"><Trans>Current effective values</Trans></h4>
        <p className="mt-1 text-xs text-muted-foreground">
          <Trans>These values reflect either the saved book override or the latest packaged defaults.</Trans>
        </p>

        <div className="mt-4 grid gap-5 md:grid-cols-2">
          <div>
            <div className="mb-2 text-xs font-medium text-muted-foreground"><Trans>Run-only tags</Trans></div>
            <div className="flex flex-wrap gap-2">
              {parseList(runOnlyTagsInput).map((tag) => (
                <Badge key={tag} variant="outline" className="font-mono text-[11px]">
                  {tag}
                </Badge>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2 text-xs font-medium text-muted-foreground"><Trans>Disabled rules</Trans></div>
            <div className="flex flex-wrap gap-2">
              {parseList(disabledRulesInput).map((rule) => (
                <Badge key={rule} variant="outline" className="font-mono text-[11px]">
                  {rule}
                </Badge>
              ))}
              {parseList(disabledRulesInput).length === 0 ? (
                <span className="text-xs text-muted-foreground"><Trans>No disabled rules</Trans></span>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function stringifyList(values: string[]): string {
  return values.join("\n")
}

function parseList(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(/[\n,]/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  )
}
