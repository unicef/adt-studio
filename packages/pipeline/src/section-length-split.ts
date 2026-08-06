/**
 * Viewport-fit splitting for reading sections.
 *
 * The renderer emits one screen per section, so a section whose content is
 * taller than the viewport forces the reader to scroll. Sectioning is the only
 * place that can prevent it, but the model cannot judge length: in a live run
 * over a 25-page novel it rejected a 1,603-character page as "not long enough"
 * to split. So the decision is made here, deterministically, on measured text.
 *
 * Calibration — real rendered sections, progressively truncated and measured in
 * headless Chromium at 1280x800 (the `desktop` entry of SCREENSHOT_VIEWPORTS):
 *
 *   cuaderno5/pg059  1,252 chars -> 800px (fits)   1,925 chars -> 1,192px (overflows)
 *   cuaderno5/pg072  1,166 chars -> 800px (fits)   1,938 chars -> 1,092px (overflows)
 *
 * DEFAULT_SECTION_CHAR_BUDGET sits at the low end of that band.
 *
 * Caveat, deliberate: character count predicts height well for prose but poorly
 * once images are present (measured R^2 = 0.29 over 51 mixed reading sections —
 * one section fit 2,134 chars in 800px while another overflowed at 794). For
 * image-bearing section types this is a best-effort heuristic, not a guarantee.
 */

/** Characters of body text that fill a 1280x800 viewport. See calibration above. */
export const DEFAULT_SECTION_CHAR_BUDGET = 1200

/** Most sections one page may be split into. Bounds per-section downstream cost. */
export const DEFAULT_MAX_SECTIONS_PER_PAGE = 3

/** Section types the budget applies to — reading content only. */
export const READING_SECTION_TYPES = new Set([
  "text_only",
  "text_and_single_image",
  "text_and_images",
])

/**
 * Roles that carry no reading content of their own. A split part consisting
 * only of these is not a section — it is a stranded fragment, and gets merged
 * back into the neighbouring part.
 */
const NON_SUBSTANTIVE_ROLES = new Set([
  "heading",
  "caption",
  "label",
  "page_number",
  "header",
  "footer",
  "book_metadata",
])

/** Minimal structural shape this module needs. Matches the LLM-facing node. */
export interface SplittableNode {
  structure?: string | null
  role?: string | null
  text?: string | null
  image_id?: string | null
  children?: SplittableNode[] | null
}

export interface SplittableSection {
  section_type: string
  nodes: SplittableNode[]
}

export interface SectionLengthSplitOptions {
  charBudget: number
  maxSectionsPerPage: number
}

/** Total body-text characters under a node, ignoring image leaves. */
export function nodeTextLength(node: SplittableNode): number {
  if (Array.isArray(node.children) && node.children.length > 0) {
    let total = 0
    for (const child of node.children) total += nodeTextLength(child)
    return total
  }
  return typeof node.text === "string" ? node.text.trim().length : 0
}

/** Total body-text characters across a list of top-level nodes. */
export function sectionTextLength(nodes: SplittableNode[]): number {
  let total = 0
  for (const node of nodes) total += nodeTextLength(node)
  return total
}

/**
 * True when a node contributes reading content — i.e. it is not purely a
 * heading, page number, running header/footer, or caption.
 */
function isSubstantive(node: SplittableNode): boolean {
  if (Array.isArray(node.children) && node.children.length > 0) {
    return node.children.some(isSubstantive)
  }
  if (typeof node.image_id === "string" && node.image_id.length > 0) return true
  if (node.role && NON_SUBSTANTIVE_ROLES.has(node.role)) return false
  return typeof node.text === "string" && node.text.trim().length > 0
}

/**
 * Partition top-level nodes into groups that each stay within `charBudget`.
 *
 * Nodes are atomic: a group boundary only ever falls *between* two top-level
 * nodes, so a paragraph (or any container) is never cut in half. A single node
 * larger than the budget therefore forms its own oversized group rather than
 * being broken up.
 */
function partitionByBudget(
  nodes: SplittableNode[],
  charBudget: number,
): SplittableNode[][] {
  const groups: SplittableNode[][] = []
  let current: SplittableNode[] = []
  let currentLen = 0

  for (const node of nodes) {
    const len = nodeTextLength(node)
    // Start a new group when this node would push the current one over budget.
    // Never emit an empty group — a single oversized node stays whole.
    if (current.length > 0 && currentLen + len > charBudget) {
      groups.push(current)
      current = []
      currentLen = 0
    }
    current.push(node)
    currentLen += len
  }
  if (current.length > 0) groups.push(current)
  return groups
}

/**
 * Partition into the fewest parts the budget allows, then even them out.
 *
 * Greedy packing alone fills the first part to the budget and dumps the
 * remainder into a near-empty tail (a 1,372-char page became 1,175 + 197 — one
 * full screen and one almost blank). Since the part *count* is already fixed by
 * the budget, the sizes can be balanced for free: binary-search the smallest
 * capacity that still packs into that many parts, and use it.
 */
function partitionBalanced(
  nodes: SplittableNode[],
  charBudget: number,
): SplittableNode[][] {
  const partCount = partitionByBudget(nodes, charBudget).length
  if (partCount <= 1) return partitionByBudget(nodes, charBudget)

  // A part can never be smaller than the largest indivisible node.
  let lo = 0
  for (const node of nodes) lo = Math.max(lo, nodeTextLength(node))
  let hi = charBudget
  let best = charBudget

  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2)
    if (mid <= 0) break
    if (partitionByBudget(nodes, mid).length <= partCount) {
      best = mid
      hi = mid - 1
    } else {
      lo = mid + 1
    }
  }
  return partitionByBudget(nodes, best)
}

/** True when every text leaf under a node is a heading — i.e. it introduces what follows. */
function isHeadingOnly(node: SplittableNode): boolean {
  if (Array.isArray(node.children) && node.children.length > 0) {
    const leaves = node.children.filter((c) => nodeTextLength(c) > 0)
    return leaves.length > 0 && leaves.every(isHeadingOnly)
  }
  if (typeof node.image_id === "string" && node.image_id.length > 0) return false
  return node.role === "heading" && (node.text ?? "").trim().length > 0
}

/**
 * A heading belongs with the prose it introduces. Greedy packing tends to leave
 * one at the tail of a group because it is short enough to fit; move any such
 * trailing heading forward to open the next group instead.
 */
function reattachHeadings(groups: SplittableNode[][]): SplittableNode[][] {
  for (let i = 0; i < groups.length - 1; i++) {
    const group = groups[i]!
    const moved: SplittableNode[] = []
    // Never empty a group entirely — leave at least one node behind.
    while (group.length > 1 && isHeadingOnly(group[group.length - 1]!)) {
      moved.unshift(group.pop()!)
    }
    if (moved.length) groups[i + 1]!.unshift(...moved)
  }
  return groups.filter((g) => g.length > 0)
}

/**
 * Merge any group that carries no reading content of its own into a neighbour,
 * so a split never strands a lone heading, caption, or page number as a section.
 */
function mergeNonSubstantive(groups: SplittableNode[][]): SplittableNode[][] {
  if (groups.length <= 1) return groups
  const out: SplittableNode[][] = []
  for (const group of groups) {
    if (out.length > 0 && !group.some(isSubstantive)) {
      // Trailing fragment (e.g. a bare page number) — append to the previous part.
      out[out.length - 1]!.push(...group)
      continue
    }
    out.push(group)
  }
  // A leading fragment (e.g. a running header alone) folds into what follows.
  while (out.length > 1 && !out[0]!.some(isSubstantive)) {
    const first = out.shift()!
    out[0]!.unshift(...first)
  }
  return out
}

/**
 * Reduce a partition to at most `maxGroups` by repeatedly merging the adjacent
 * pair with the smallest combined length — keeps the resulting parts as even as
 * possible instead of blindly collapsing the tail.
 */
function capGroups(
  groups: SplittableNode[][],
  maxGroups: number,
): SplittableNode[][] {
  const out = groups.map((g) => [...g])
  while (out.length > maxGroups) {
    let bestIdx = 0
    let bestLen = Infinity
    for (let i = 0; i < out.length - 1; i++) {
      const combined = sectionTextLength(out[i]!) + sectionTextLength(out[i + 1]!)
      if (combined < bestLen) {
        bestLen = combined
        bestIdx = i
      }
    }
    out[bestIdx]!.push(...out[bestIdx + 1]!)
    out.splice(bestIdx + 1, 1)
  }
  return out
}

/**
 * Split reading sections whose text exceeds the viewport budget into several
 * sections, cutting only between top-level nodes.
 *
 * Non-reading sections (covers, credits, separators, activities) are returned
 * untouched — activity sections are partitioned by learner mechanic, not length.
 * Returns a new array; the input sections are not mutated.
 */
export function splitOversizedReadingSections<T extends SplittableSection>(
  sections: T[],
  options: SectionLengthSplitOptions,
): T[] {
  const { charBudget, maxSectionsPerPage } = options
  if (!Number.isFinite(charBudget) || charBudget <= 0) return sections
  if (!Number.isFinite(maxSectionsPerPage) || maxSectionsPerPage < 1) return sections

  // The cap is per page and the model may already have split the page by
  // activity mechanic, so only the sections still available under the cap can
  // be handed out here.
  let extraAllowance = Math.max(0, maxSectionsPerPage - sections.length)

  const out: T[] = []
  for (const section of sections) {
    if (
      extraAllowance <= 0 ||
      !READING_SECTION_TYPES.has(section.section_type) ||
      sectionTextLength(section.nodes) <= charBudget
    ) {
      out.push(section)
      continue
    }

    const groups = capGroups(
      mergeNonSubstantive(
        reattachHeadings(partitionBalanced(section.nodes, charBudget)),
      ),
      1 + extraAllowance,
    )
    if (groups.length <= 1) {
      out.push(section)
      continue
    }
    extraAllowance -= groups.length - 1
    for (const nodes of groups) {
      out.push({ ...section, nodes })
    }
  }
  return out
}
