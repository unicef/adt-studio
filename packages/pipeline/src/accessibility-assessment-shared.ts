import fs from "node:fs"
import path from "node:path"
import { z } from "zod"
import type {
  AccessibilityAssessmentOutput,
  AccessibilityFinding,
  AccessibilityNodeResult,
  AccessibilityPageResult,
  BrowserAccessibilityAssessmentOutput,
} from "@adt/types"
import { parseSectionId } from "@adt/types"

export const DEFAULT_AXE_RUN_ONLY_TAGS = [
  "wcag2a",
  "wcag2aa",
  "wcag21a",
  "wcag21aa",
  "best-practice",
  "cat.semantics",
  "cat.tables",
  "cat.keyboard",
  "cat.forms",
  "cat.text-alternatives",
  "cat.time-and-media",
  "cat.name-role-value",
  "cat.structure",
  "cat.parsing",
  "cat.language",
  "cat.sensory-and-visual-cues",
  "cat.color",
  "experimental",
] as const

export const DEFAULT_DISABLED_AXE_RULES = ["color-contrast"] as const

export const PackagedPageManifestEntry = z.object({
  section_id: z.string(),
  href: z.string().min(1),
  page_number: z.number().int().optional(),
})

export type PackagedPageManifestEntry = z.infer<typeof PackagedPageManifestEntry>

export function derivePageId(sectionId: string): string | null {
  return parseSectionId(sectionId)?.pageId ?? null
}

export function getPackagedPageEntries(bookDir: string): PackagedPageManifestEntry[] {
  const pagesPath = path.join(bookDir, "adt", "content", "pages.json")
  if (!fs.existsSync(pagesPath)) {
    throw new Error("Packaged ADT pages manifest not found")
  }

  const parsed = JSON.parse(fs.readFileSync(pagesPath, "utf-8")) as unknown
  return z.array(PackagedPageManifestEntry).parse(parsed)
}

export function getUniquePackagedPageEntries(bookDir: string): PackagedPageManifestEntry[] {
  const pageEntries = getPackagedPageEntries(bookDir)
  return Array.from(new Map(pageEntries.map((entry) => [entry.href, entry])).values())
}

export function resolvePackagedPageFilePath(
  adtDir: string,
  href: string,
): { filePath: string | null; error: string | null } {
  const filePath = path.resolve(adtDir, href)
  const resolvedAdtDir = path.resolve(adtDir)
  if (!filePath.startsWith(resolvedAdtDir + path.sep) && filePath !== resolvedAdtDir) {
    return {
      filePath: null,
      error: "Packaged page path resolves outside the ADT directory",
    }
  }

  return { filePath, error: null }
}

export function getAxeSource(mod: unknown): string {
  if (typeof mod === "object" && mod !== null && "source" in mod) {
    const source = (mod as { source?: unknown }).source
    if (typeof source === "string") return source
  }
  if (typeof mod === "object" && mod !== null && "default" in mod) {
    const def = (mod as { default?: { source?: unknown } }).default
    if (typeof def?.source === "string") return def.source
  }
  throw new Error("Unable to load axe-core source")
}

export function normalizeNode(node: unknown): AccessibilityNodeResult {
  if (typeof node !== "object" || node === null) {
    return { target: [] }
  }

  const target = Array.isArray((node as { target?: unknown }).target)
    ? (node as { target: unknown[] }).target.filter((item): item is string => typeof item === "string")
    : []

  const html = typeof (node as { html?: unknown }).html === "string"
    ? (node as { html: string }).html
    : undefined

  const failureSummaryValue = (node as { failureSummary?: unknown }).failureSummary
  const failureSummary = typeof failureSummaryValue === "string"
    ? failureSummaryValue
    : failureSummaryValue === null
      ? null
      : undefined

  return {
    target,
    ...(html ? { html } : {}),
    ...(failureSummary !== undefined ? { failureSummary } : {}),
  }
}

/**
 * Returns true when every node in a finding reports "Axe encountered an error",
 * meaning axe-core itself failed to evaluate the rule (common in JSDOM where
 * layout APIs are missing). These findings carry no actionable signal.
 */
export function isAxeInternalError(finding: AccessibilityFinding): boolean {
  return (
    finding.nodes.length > 0 &&
    finding.nodes.every(
      (node) =>
        typeof node.failureSummary === "string" &&
        node.failureSummary.includes("Axe encountered an error"),
    )
  )
}

export function normalizeFinding(finding: unknown): AccessibilityFinding {
  if (typeof finding !== "object" || finding === null) {
    return {
      id: "unknown",
      impact: null,
      description: "",
      help: "",
      helpUrl: "",
      tags: [],
      nodes: [],
    }
  }

  const rawNodes = Array.isArray((finding as { nodes?: unknown }).nodes)
    ? (finding as { nodes: unknown[] }).nodes
    : []

  return {
    id: typeof (finding as { id?: unknown }).id === "string"
      ? (finding as { id: string }).id
      : "unknown",
    impact: typeof (finding as { impact?: unknown }).impact === "string"
      ? (finding as { impact: string }).impact
      : (finding as { impact?: unknown }).impact === null
        ? null
        : null,
    description: typeof (finding as { description?: unknown }).description === "string"
      ? (finding as { description: string }).description
      : "",
    help: typeof (finding as { help?: unknown }).help === "string"
      ? (finding as { help: string }).help
      : "",
    helpUrl: typeof (finding as { helpUrl?: unknown }).helpUrl === "string"
      ? (finding as { helpUrl: string }).helpUrl
      : "",
    tags: Array.isArray((finding as { tags?: unknown }).tags)
      ? (finding as { tags: unknown[] }).tags.filter((tag): tag is string => typeof tag === "string")
      : [],
    nodes: rawNodes.map(normalizeNode),
  }
}

/**
 * Merge JSDOM base assessment with a browser recheck to produce a single
 * clean AccessibilityAssessmentOutput.  For each page that the browser
 * rechecked, JSDOM incompletes for the rechecked rules are replaced by the
 * browser's authoritative results.
 */
export function mergeAccessibilityResults(
  base: AccessibilityAssessmentOutput,
  browser: BrowserAccessibilityAssessmentOutput,
): AccessibilityAssessmentOutput {
  const browserPagesByHref = new Map(browser.pages.map((p) => [p.href, p]))

  const pages: AccessibilityPageResult[] = base.pages.map((basePage) => {
    const browserPage = browserPagesByHref.get(basePage.href)
    if (!browserPage) return basePage

    const recheckedRuleSet = new Set(browserPage.recheckedRuleIds)

    // Keep JSDOM incompletes for rules the browser did NOT recheck
    const keptIncomplete = basePage.incomplete.filter(
      (f) => !recheckedRuleSet.has(f.id),
    )

    // Merge violations: keep all JSDOM violations plus any new browser violations
    const existingViolationIds = new Set(basePage.violations.map((f) => f.id))
    const newBrowserViolations = browserPage.violations.filter(
      (f) => !existingViolationIds.has(f.id),
    )
    const violations = [...basePage.violations, ...newBrowserViolations]

    // Browser incompletes for rechecked rules (real incompletes, not JSDOM artifacts)
    const incomplete = [...keptIncomplete, ...browserPage.incomplete]

    return {
      ...basePage,
      violations,
      violationCount: violations.length,
      incomplete,
      incompleteCount: incomplete.length,
    }
  })

  return {
    ...base,
    pages,
    summary: {
      pageCount: pages.length,
      pagesWithViolations: pages.filter((p) => p.violationCount > 0).length,
      pagesWithErrors: pages.filter((p) => Boolean(p.error)).length,
      violationCount: pages.reduce((sum, p) => sum + p.violationCount, 0),
      incompleteCount: pages.reduce((sum, p) => sum + p.incompleteCount, 0),
    },
  }
}
