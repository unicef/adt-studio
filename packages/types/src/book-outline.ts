import { z } from "zod"

/** Semantic heading depth supported by HTML and the generated book outline. */
export const HeadingLevel = z.number().int().min(1).max(6)
export type HeadingLevel = z.infer<typeof HeadingLevel>

/**
 * Heading purpose is deliberately separate from heading depth. A callout can
 * be an H2, H3, or H4 depending on where it sits in the book outline.
 */
export const HeadingKind = z.enum([
  "part",
  "chapter",
  "section",
  "subsection",
  "activity",
  "callout",
  "other",
])
export type HeadingKind = z.infer<typeof HeadingKind>

/** Compatibility map for the role-based section tree. */
export const HEADING_ROLE_LEVELS: Readonly<Record<string, number | null>> = {
  chapter_title: 1,
  section_heading: 2,
  subheading: 3,
  heading: null,
}

export function isHeadingRole(role: string | undefined): boolean {
  return role !== undefined && Object.hasOwn(HEADING_ROLE_LEVELS, role)
}

export function headingLevelForRole(role: string | undefined): number | null {
  return role !== undefined && Object.hasOwn(HEADING_ROLE_LEVELS, role)
    ? HEADING_ROLE_LEVELS[role]
    : null
}

export const BookOutlineStyleCluster = z.object({
  styleClusterId: z.string().min(1),
  description: z.string(),
  level: HeadingLevel,
})
export type BookOutlineStyleCluster = z.infer<typeof BookOutlineStyleCluster>

export const BookOutlineEntry = z.object({
  outlineId: z.string().min(1),
  title: z.string().min(1),
  level: HeadingLevel,
  kind: HeadingKind,
  pageId: z.string().min(1),
  pageNumber: z.number().int().min(1),
  /** IDs from the compact positioned-text evidence supplied to the model. */
  sourceCandidateIds: z.array(z.string().min(1)).min(1),
  parentId: z.string().min(1).nullable(),
  styleClusterId: z.string().min(1),
  confidence: z.number().min(0).max(1),
})
export type BookOutlineEntry = z.infer<typeof BookOutlineEntry>

/** Versioned, inspectable book-level hierarchy produced before page sectioning. */
export const BookOutlineOutput = z.object({
  reasoning: z.string(),
  entries: z.array(BookOutlineEntry),
  styleClusters: z.array(BookOutlineStyleCluster),
})
export type BookOutlineOutput = z.infer<typeof BookOutlineOutput>

/**
 * Compact LLM-only proposal. Exact titles, page references, sequential IDs,
 * and parent IDs are derived from candidate IDs after generation so the model
 * spends tokens only on semantic decisions.
 */
export const BookOutlineProposalEntry = z.object({
  sourceCandidateIds: z.array(z.string().min(1)).min(1),
  level: HeadingLevel,
  kind: HeadingKind,
  styleClusterId: z.string().min(1),
  confidence: z.number().min(0).max(1),
})
export type BookOutlineProposalEntry = z.infer<typeof BookOutlineProposalEntry>

export const BookOutlineProposalOutput = z.object({
  /** Prompted to be concise; truncated deterministically after generation. */
  reasoning: z.string(),
  entries: z.array(BookOutlineProposalEntry),
  styleClusters: z.array(BookOutlineStyleCluster),
})
export type BookOutlineProposalOutput = z.infer<typeof BookOutlineProposalOutput>

/** A heading assignment currently present in a page-sectioning tree. */
export const BookOutlineAppliedHeading = z.object({
  outlineEntryId: z.string(),
  pageId: z.string(),
  nodeId: z.string(),
  role: z.string(),
  text: z.string(),
  headingLevel: HeadingLevel.optional(),
  headingStyleClusterId: z.string().optional(),
})
export type BookOutlineAppliedHeading = z.infer<typeof BookOutlineAppliedHeading>

/** Latest stored outline plus its observable downstream assignments. */
export const BookOutlineAuditResponse = z.object({
  version: z.number().int().min(1),
  outline: BookOutlineOutput,
  appliedHeadings: z.array(BookOutlineAppliedHeading),
})
export type BookOutlineAuditResponse = z.infer<typeof BookOutlineAuditResponse>
