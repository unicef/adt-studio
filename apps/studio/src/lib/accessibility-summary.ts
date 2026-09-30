import type {
  AccessibilityAssessmentOutput,
  AccessibilityFinding,
  AccessibilityPageResult,
} from "@adt/types"
import type { I18n, MessageDescriptor } from "@lingui/core"
import { msg } from "@lingui/core/macro"

export type AccessibilitySeverity = "critical" | "serious" | "moderate" | "minor" | "unknown"
export type AccessibilityCategoryKey =
  | "text-alternatives"
  | "structure-semantics"
  | "keyboard-navigation"
  | "forms-controls"
  | "tables"
  | "media-timing"
  | "visual-cues"
  | "other"

export interface AccessibilityCategorySummary {
  key: AccessibilityCategoryKey
  label: AccessibilityCategoryKey
  count: number
  pagesAffected: number
}

export interface AccessibilityFindingPageSummary {
  pageId: string | null
  sectionId: string
  href: string
  title: string | null
  pageNumber: number | null
  count: number
}

export interface FrequentAccessibilityFindingSummary {
  id: string
  help: string
  helpUrl: string
  description: string
  impact: AccessibilitySeverity
  reviewOnly: boolean
  count: number
  pagesAffected: number
  pageCoverage: number
  categoryKey: AccessibilityCategoryKey
  categoryLabel: AccessibilityCategoryKey
  pages: AccessibilityFindingPageSummary[]
}

export interface AccessibilityOverview {
  severity: Record<AccessibilitySeverity, number>
  categories: AccessibilityCategorySummary[]
  totalChecks: number
}

export interface PageAccessibilitySummary {
  sectionId: string
  href: string
  title: string | null
  issueCount: number
  reviewCount: number
  totalCount: number
  hasError: boolean
  status: "clean" | "issues" | "error"
  categories: AccessibilityCategorySummary[]
}

const CATEGORY_ORDER: AccessibilityCategoryKey[] = [
  "text-alternatives",
  "structure-semantics",
  "keyboard-navigation",
  "forms-controls",
  "tables",
  "media-timing",
  "visual-cues",
  "other",
]

const CATEGORY_LABELS: Record<AccessibilityCategoryKey, MessageDescriptor> = {
  "text-alternatives": msg`Text alternatives`,
  "structure-semantics": msg`Structure & semantics`,
  "keyboard-navigation": msg`Keyboard & navigation`,
  "forms-controls": msg`Forms & controls`,
  tables: msg`Tables`,
  "media-timing": msg`Media & timing`,
  "visual-cues": msg`Visual & sensory cues`,
  other: msg`Other`,
}

const CATEGORY_TAGS: Array<{ key: AccessibilityCategoryKey; tags: string[] }> = [
  { key: "text-alternatives", tags: ["cat.text-alternatives"] },
  {
    key: "structure-semantics",
    tags: ["cat.structure", "cat.semantics", "cat.aria", "cat.language", "cat.name-role-value", "cat.parsing"],
  },
  { key: "keyboard-navigation", tags: ["cat.keyboard"] },
  { key: "forms-controls", tags: ["cat.forms"] },
  { key: "tables", tags: ["cat.tables"] },
  { key: "media-timing", tags: ["cat.time-and-media"] },
  { key: "visual-cues", tags: ["cat.color", "cat.sensory-and-visual-cues"] },
]

function getSeverityKey(impact: string | null): AccessibilitySeverity {
  if (impact === "critical" || impact === "serious" || impact === "moderate" || impact === "minor") {
    return impact
  }
  return "unknown"
}

function getCategoryKey(finding: AccessibilityFinding): AccessibilityCategoryKey {
  for (const category of CATEGORY_TAGS) {
    if (category.tags.some((tag) => finding.tags.includes(tag))) {
      return category.key
    }
  }
  return "other"
}

export function getAccessibilityCategoryLabel(i18n: I18n, key: AccessibilityCategoryKey): string {
  return i18n._(CATEGORY_LABELS[key])
}

function buildCategorySummary(
  page: AccessibilityPageResult,
  findings: AccessibilityFinding[],
): AccessibilityCategorySummary[] {
  const categoryCounts = new Map<AccessibilityCategoryKey, { count: number; pages: Set<string> }>()

  for (const finding of findings) {
    const key = getCategoryKey(finding)
    const entry = categoryCounts.get(key) ?? { count: 0, pages: new Set<string>() }
    entry.count += 1
    entry.pages.add(page.sectionId)
    categoryCounts.set(key, entry)
  }

  return CATEGORY_ORDER
    .map((key) => {
      const entry = categoryCounts.get(key)
      if (!entry) return null
      return {
        key,
        label: key,
        count: entry.count,
        pagesAffected: entry.pages.size,
      }
    })
    .filter((entry): entry is AccessibilityCategorySummary => entry !== null)
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))
}

export function normalizeAccessibilityHref(href: string): string {
  const [withoutHash] = href.split("#")
  const [withoutQuery] = withoutHash.split("?")
  const trimmed = withoutQuery.replace(/^\/+/, "")

  if (trimmed.length === 0) {
    return "index.html"
  }

  const parts = trimmed.split("/").filter(Boolean)
  const versionIndex = parts.findIndex((part) => /^v-[^/]+$/.test(part))
  const relativeParts = versionIndex >= 0 ? parts.slice(versionIndex + 1) : parts
  const normalized = relativeParts.join("/")

  return normalized.length > 0 ? normalized : "index.html"
}

export function buildAccessibilityOverview(
  assessment: AccessibilityAssessmentOutput,
): AccessibilityOverview {
  const severity: Record<AccessibilitySeverity, number> = {
    critical: 0,
    serious: 0,
    moderate: 0,
    minor: 0,
    unknown: 0,
  }
  const categories = new Map<AccessibilityCategoryKey, { count: number; pages: Set<string> }>()

  for (const page of assessment.pages) {
    for (const violation of page.violations) {
      severity[getSeverityKey(violation.impact)] += 1
    }

    for (const finding of [...page.violations, ...page.incomplete]) {
      const key = getCategoryKey(finding)
      const entry = categories.get(key) ?? { count: 0, pages: new Set<string>() }
      entry.count += 1
      entry.pages.add(page.sectionId)
      categories.set(key, entry)
    }
  }

  return {
    severity,
    totalChecks: assessment.summary.violationCount + assessment.summary.incompleteCount,
    categories: CATEGORY_ORDER
      .map((key) => {
        const entry = categories.get(key)
        if (!entry) return null
        return {
          key,
          label: key,
          count: entry.count,
          pagesAffected: entry.pages.size,
        }
      })
      .filter((entry): entry is AccessibilityCategorySummary => entry !== null)
      .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label)),
  }
}

export function buildFrequentAccessibilityFindings(
  assessment: AccessibilityAssessmentOutput,
  options?: { limit?: number },
): FrequentAccessibilityFindingSummary[] {
  const findings = new Map<string, {
    id: string
    help: string
    helpUrl: string
    description: string
    impact: AccessibilitySeverity
    reviewOnly: boolean
    count: number
    pages: Map<string, AccessibilityFindingPageSummary>
    categoryKey: AccessibilityCategoryKey
  }>()

  for (const page of assessment.pages) {
    for (const finding of page.violations) {
      const categoryKey = getCategoryKey(finding)
      const key = `violation:${finding.id}`
      const entry = findings.get(key) ?? {
        id: finding.id,
        help: finding.help,
        helpUrl: finding.helpUrl,
        description: finding.description,
        impact: getSeverityKey(finding.impact),
        reviewOnly: false,
        count: 0,
        pages: new Map<string, AccessibilityFindingPageSummary>(),
        categoryKey,
      }
      entry.count += 1
      const pageEntry = entry.pages.get(page.sectionId) ?? {
        pageId: page.pageId,
        sectionId: page.sectionId,
        href: page.href,
        title: page.title,
        pageNumber: page.pageNumber,
        count: 0,
      }
      pageEntry.count += 1
      entry.pages.set(page.sectionId, pageEntry)
      findings.set(key, entry)
    }

    for (const finding of page.incomplete) {
      const categoryKey = getCategoryKey(finding)
      const key = `review:${finding.id}`
      const entry = findings.get(key) ?? {
        id: finding.id,
        help: finding.help,
        helpUrl: finding.helpUrl,
        description: finding.description,
        impact: getSeverityKey(finding.impact),
        reviewOnly: true,
        count: 0,
        pages: new Map<string, AccessibilityFindingPageSummary>(),
        categoryKey,
      }
      entry.count += 1
      const pageEntry = entry.pages.get(page.sectionId) ?? {
        pageId: page.pageId,
        sectionId: page.sectionId,
        href: page.href,
        title: page.title,
        pageNumber: page.pageNumber,
        count: 0,
      }
      pageEntry.count += 1
      entry.pages.set(page.sectionId, pageEntry)
      findings.set(key, entry)
    }
  }

  const pageCount = Math.max(assessment.summary.pageCount, 1)

  return [...findings.values()]
    .map((finding) => ({
      id: finding.id,
      help: finding.help,
      helpUrl: finding.helpUrl,
      description: finding.description,
      impact: finding.impact,
      reviewOnly: finding.reviewOnly,
      count: finding.count,
      pagesAffected: finding.pages.size,
      pageCoverage: finding.pages.size / pageCount,
      categoryKey: finding.categoryKey,
      categoryLabel: finding.categoryKey,
      pages: [...finding.pages.values()].sort((left, right) => {
        if (left.pageNumber != null && right.pageNumber != null && left.pageNumber !== right.pageNumber) {
          return left.pageNumber - right.pageNumber
        }
        if (left.pageNumber != null) {
          return -1
        }
        if (right.pageNumber != null) {
          return 1
        }
        return left.href.localeCompare(right.href)
      }),
    }))
    .sort((left, right) => {
      if (left.pagesAffected !== right.pagesAffected) {
        return right.pagesAffected - left.pagesAffected
      }
      if (left.count !== right.count) {
        return right.count - left.count
      }
      if (left.reviewOnly !== right.reviewOnly) {
        return left.reviewOnly ? 1 : -1
      }
      return left.help.localeCompare(right.help)
    })
    .slice(0, options?.limit ?? 6)
}

export function findAccessibilityPage(
  assessment: AccessibilityAssessmentOutput,
  current: { sectionId?: string | null; href?: string | null },
): AccessibilityPageResult | null {
  if (current.sectionId) {
    const bySection = assessment.pages.find((page) => page.sectionId === current.sectionId)
    if (bySection) {
      return bySection
    }
  }

  if (current.href) {
    const normalizedHref = normalizeAccessibilityHref(current.href)
    return (
      assessment.pages.find((page) => normalizeAccessibilityHref(page.href) === normalizedHref) ??
      null
    )
  }

  return null
}

export function summarizeAccessibilityPage(
  page: AccessibilityPageResult | null,
): PageAccessibilitySummary | null {
  if (!page) {
    return null
  }

  const findings = [...page.violations, ...page.incomplete]
  const issueCount = page.violationCount
  const reviewCount = page.incompleteCount
  const totalCount = issueCount + reviewCount

  return {
    sectionId: page.sectionId,
    href: page.href,
    title: page.title,
    issueCount,
    reviewCount,
    totalCount,
    hasError: Boolean(page.error),
    status: page.error ? "error" : totalCount > 0 ? "issues" : "clean",
    categories: buildCategorySummary(page, findings),
  }
}
