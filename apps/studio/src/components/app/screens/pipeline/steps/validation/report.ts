import type { AccessibilityAssessmentOutput } from "@adt/types"
import {
  buildAccessibilityOverview,
  buildFrequentAccessibilityFindings,
  type AccessibilityCategoryKey,
  type AccessibilitySeverity,
  type FrequentAccessibilityFindingSummary,
} from "@/lib/accessibility-summary"
import { SEVERITY_ORDER, SEVERITY_RANK } from "./severity"

export type FindingKind = "all" | "review" | AccessibilitySeverity

export interface FindingFilters {
  kind: FindingKind
  category: AccessibilityCategoryKey | null
}

export const NO_FILTERS: FindingFilters = { kind: "all", category: null }

export interface ReportCount<T extends string> {
  value: T
  count: number
}

export interface AccessibilityReport {
  findings: FrequentAccessibilityFindingSummary[]
  visible: FrequentAccessibilityFindingSummary[]
  kinds: ReportCount<FindingKind>[]
  categories: ReportCount<AccessibilityCategoryKey>[]
  categoryTotal: number
  issueCount: number
  reviewCount: number
  pageCount: number
}

type Finding = FrequentAccessibilityFindingSummary

const sum = (findings: Finding[]) => findings.reduce((total, finding) => total + finding.count, 0)

export function matchesKind(finding: Finding, kind: FindingKind): boolean {
  if (kind === "all") return true
  if (kind === "review") return finding.reviewOnly
  return !finding.reviewOnly && finding.impact === kind
}

export function buildAccessibilityReport(assessment: AccessibilityAssessmentOutput, filters: FindingFilters): AccessibilityReport {
  const overview = buildAccessibilityOverview(assessment)
  const findings = buildFrequentAccessibilityFindings(assessment, { limit: 100 }).sort(
    (a, b) => Number(a.reviewOnly) - Number(b.reviewOnly) || SEVERITY_RANK[a.impact] - SEVERITY_RANK[b.impact] || b.pagesAffected - a.pagesAffected,
  )

  const inCategory = filters.category ? findings.filter((finding) => finding.categoryKey === filters.category) : findings
  const issues = inCategory.filter((finding) => !finding.reviewOnly)
  const kinds: ReportCount<FindingKind>[] = [
    { value: "all", count: sum(inCategory) },
    ...SEVERITY_ORDER.map((severity) => ({ value: severity, count: sum(issues.filter((finding) => finding.impact === severity)) })).filter(
      (entry) => entry.count > 0 || entry.value === filters.kind,
    ),
  ]
  const reviewCount = sum(inCategory.filter((finding) => finding.reviewOnly))
  if (reviewCount > 0 || filters.kind === "review") kinds.push({ value: "review", count: reviewCount })

  const ofKind = findings.filter((finding) => matchesKind(finding, filters.kind))
  const categories = overview.categories
    .map((category) => ({ value: category.key, count: sum(ofKind.filter((finding) => finding.categoryKey === category.key)) }))
    .filter((entry) => entry.count > 0 || entry.value === filters.category)

  return {
    findings,
    visible: ofKind.filter((finding) => !filters.category || finding.categoryKey === filters.category),
    kinds,
    categories,
    categoryTotal: sum(ofKind),
    issueCount: assessment.summary.violationCount,
    reviewCount: assessment.summary.incompleteCount,
    pageCount: assessment.summary.pageCount,
  }
}

export interface PageRef {
  pageId: string
  pageNumber: number
}

export interface FindingPageLabel {
  pageNumber: number | null
  pageId: string | null
  part: number | null
  quiz: number | null
}

export function sectionPageIds(assessment: AccessibilityAssessmentOutput): Map<string, string> {
  const map = new Map<string, string>()
  for (const page of assessment.pages) if (page.pageId) map.set(page.sectionId, page.pageId)
  return map
}

export function resolveFindingPages(
  pages: Finding["pages"],
  pageOfSection: ReadonlyMap<string, string>,
  bookPages: readonly PageRef[],
): Array<Finding["pages"][number] & FindingPageLabel> {
  const numberOf = new Map(bookPages.map((page) => [page.pageId, page.pageNumber]))
  const resolved = pages.map((page) => {
    const pageId = pageOfSection.get(page.sectionId) ?? null
    const quiz = pageId ? null : /^qz(\d+)/.exec(page.sectionId)
    if (quiz) return { ...page, pageId, pageNumber: null as number | null, part: null as number | null, quiz: Number(quiz[1]) as number | null }
    return { ...page, pageId, pageNumber: (pageId ? numberOf.get(pageId) : undefined) ?? page.pageNumber, part: null as number | null, quiz: null as number | null }
  })
  const perPage = new Map<string, number>()
  for (const page of resolved) if (page.pageId) perPage.set(page.pageId, (perPage.get(page.pageId) ?? 0) + 1)
  const order = (page: (typeof resolved)[number]) => (page.quiz != null ? 1e6 + page.quiz : (page.pageNumber ?? 5e5))
  return resolved
    .map((page) => {
      if (!page.pageId || (perPage.get(page.pageId) ?? 0) < 2) return page
      const match = /_sec(\d+)$/.exec(page.sectionId)
      return { ...page, part: match ? Number(match[1]) : null }
    })
    .sort((a, b) => order(a) - order(b) || (a.part ?? 0) - (b.part ?? 0))
}
