import { useMemo, useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { plural } from "@lingui/core/macro"
import { CircleCheck } from "lucide-react"
import type { AccessibilityAssessmentOutput } from "@adt/types"
import { getAccessibilityCategoryLabel, type AccessibilityCategoryKey } from "@/lib/accessibility-summary"
import { ListToolbar } from "../shared/list/ListToolbar"
import { StepFilterTabs } from "../shared/StepFilterTabs"
import { StepEmptyHint } from "../shared/ui"
import { FindingCard } from "./FindingCard"
import { buildAccessibilityReport, NO_FILTERS, resolveFindingPages, sectionPageIds, type FindingFilters, type FindingKind, type PageRef } from "./report"
import { SeverityDot, SeverityLabel } from "./severity"

const ALL_CATEGORIES = "all"

export function AccessibilityReport({
  assessment,
  hex,
  bookPages,
  onOpenPage,
}: {
  assessment: AccessibilityAssessmentOutput
  hex: string
  bookPages: readonly PageRef[]
  onOpenPage: (href: string) => void
}) {
  const { t, i18n } = useLingui()
  const [filters, setFilters] = useState<FindingFilters>(NO_FILTERS)
  const report = useMemo(() => buildAccessibilityReport(assessment, filters), [assessment, filters])
  const pageOfSection = useMemo(() => sectionPageIds(assessment), [assessment])
  const filtered = filters.kind !== "all" || filters.category !== null
  const setKind = (kind: FindingKind) => setFilters((current) => ({ ...current, kind }))
  const setCategory = (category: AccessibilityCategoryKey | null) => setFilters((current) => ({ ...current, category }))

  if (report.findings.length === 0) {
    return (
      <StepEmptyHint>
        <span className="flex flex-col items-center gap-2 text-center">
          <CircleCheck aria-hidden className="size-5" style={{ color: hex }} />
          <span className="font-medium text-foreground">
            {t`No problems found on ${plural(report.pageCount, { one: "# page", other: "# pages" })}.`}
          </span>
          <span>
            <Trans>Automatic checks can't catch everything. A quick read-through in Preview is still worth it.</Trans>
          </span>
        </span>
      </StepEmptyHint>
    )
  }

  const kindLabel = (kind: FindingKind) =>
    kind === "all" ? (
      t`All`
    ) : kind === "review" ? (
      <span className="inline-flex items-center gap-1.5">
        <SeverityDot severity="unknown" review />
        <Trans>To check</Trans>
      </span>
    ) : (
      <span className="inline-flex items-center gap-1.5">
        <SeverityDot severity={kind} />
        <SeverityLabel severity={kind} />
      </span>
    )

  return (
    <>
      <ListToolbar
        left={
          <StepFilterTabs
            ariaLabel={t`Show by severity`}
            accent={hex}
            value={filters.kind}
            onChange={setKind}
            options={report.kinds.map((entry) => ({ value: entry.value, label: kindLabel(entry.value), count: entry.count }))}
          />
        }
        right={
          <>
            {filtered && (
              <button
                type="button"
                onClick={() => setFilters(NO_FILTERS)}
                className="h-7 rounded-md px-2 text-[11.5px] font-medium text-muted-foreground transition-colors animate-in fade-in duration-200 hover:bg-muted hover:text-foreground motion-reduce:animate-none"
              >
                <Trans>Clear filters</Trans>
              </button>
            )}
            <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
              {filtered
                ? t`${report.visible.length} of ${plural(report.findings.length, { one: "# rule", other: "# rules" })}`
                : t`${plural(report.findings.length, { one: "# rule", other: "# rules" })}`}
            </span>
          </>
        }
      />
      {report.categories.length > 1 && (
        <StepFilterTabs
          ariaLabel={t`Show by kind of problem`}
          accent={hex}
          className="-mt-2 max-w-full flex-wrap self-start"
          value={filters.category ?? ALL_CATEGORIES}
          onChange={(value) => setCategory(value === ALL_CATEGORIES ? null : (value as AccessibilityCategoryKey))}
          options={[
            { value: ALL_CATEGORIES, label: t`Every kind`, count: report.categoryTotal },
            ...report.categories.map((entry) => ({
              value: entry.value,
              label: getAccessibilityCategoryLabel(i18n, entry.value),
              count: entry.count,
            })),
          ]}
        />
      )}
      {report.visible.length === 0 ? (
        <StepEmptyHint>
          <span className="flex flex-col items-center gap-2">
            {t`Nothing matches these filters.`}
            <button
              type="button"
              onClick={() => setFilters(NO_FILTERS)}
              className="font-medium text-foreground underline-offset-4 transition-colors hover:underline"
            >
              {t`Clear filters`}
            </button>
          </span>
        </StepEmptyHint>
      ) : (
        <div className="flex flex-col gap-3">
          {report.visible.map((finding) => (
            <FindingCard
              key={`${finding.reviewOnly ? "review" : "violation"}:${finding.id}`}
              finding={finding}
              pageCount={report.pageCount}
              pages={resolveFindingPages(finding.pages, pageOfSection, bookPages)}
              hex={hex}
              onOpenPage={onOpenPage}
              onKind={setKind}
              onCategory={setCategory}
            />
          ))}
        </div>
      )}
    </>
  )
}
