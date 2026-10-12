import { z } from "zod"
import { ValidationArtifactSnapshot } from "./validation-repair.js"

export const AccessibilityNodeResult = z.object({
  target: z.array(z.string()),
  html: z.string().optional(),
  failureSummary: z.string().nullable().optional(),
})
export type AccessibilityNodeResult = z.infer<typeof AccessibilityNodeResult>

export const AccessibilityFinding = z.object({
  id: z.string(),
  impact: z.string().nullable(),
  description: z.string(),
  help: z.string(),
  helpUrl: z.string(),
  tags: z.array(z.string()),
  nodes: z.array(AccessibilityNodeResult),
})
export type AccessibilityFinding = z.infer<typeof AccessibilityFinding>

export const AccessibilityPageResult = z.object({
  pageId: z.string().nullable(),
  sectionId: z.string(),
  href: z.string(),
  pageNumber: z.number().int().nullable(),
  title: z.string().nullable(),
  error: z.string().nullable().optional(),
  violationCount: z.number().int(),
  incompleteCount: z.number().int(),
  passCount: z.number().int(),
  inapplicableCount: z.number().int(),
  violations: z.array(AccessibilityFinding),
  incomplete: z.array(AccessibilityFinding),
})
export type AccessibilityPageResult = z.infer<typeof AccessibilityPageResult>

export const BrowserAccessibilityPageResult = AccessibilityPageResult.extend({
  recheckedRuleIds: z.array(z.string()),
})
export type BrowserAccessibilityPageResult = z.infer<typeof BrowserAccessibilityPageResult>

export const AccessibilityAssessmentSummary = z.object({
  pageCount: z.number().int(),
  pagesWithViolations: z.number().int(),
  pagesWithErrors: z.number().int(),
  violationCount: z.number().int(),
  incompleteCount: z.number().int(),
})
export type AccessibilityAssessmentSummary = z.infer<typeof AccessibilityAssessmentSummary>

export const BrowserAccessibilityAssessmentSummary = AccessibilityAssessmentSummary.extend({
  recheckedPageCount: z.number().int(),
})
export type BrowserAccessibilityAssessmentSummary = z.infer<typeof BrowserAccessibilityAssessmentSummary>

export const AccessibilityAssessmentOutput = z.object({
  artifact: ValidationArtifactSnapshot.optional(),
  artifactHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  generatedAt: z.string(),
  tool: z.literal("axe-core"),
  runOnlyTags: z.array(z.string()),
  disabledRules: z.array(z.string()),
  pages: z.array(AccessibilityPageResult),
  summary: AccessibilityAssessmentSummary,
})
export type AccessibilityAssessmentOutput = z.infer<typeof AccessibilityAssessmentOutput>

export const BrowserAccessibilityAssessmentOutput = z.object({
  generatedAt: z.string(),
  tool: z.enum(["axe-core-playwright", "axe-core-electron"]),
  baseGeneratedAt: z.string().nullable(),
  ruleIds: z.array(z.string()),
  pages: z.array(BrowserAccessibilityPageResult),
  summary: BrowserAccessibilityAssessmentSummary,
})
export type BrowserAccessibilityAssessmentOutput = z.infer<typeof BrowserAccessibilityAssessmentOutput>
