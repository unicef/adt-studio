/**
 * Render-sectioning resolver.
 *
 * `page-sectioning` always holds the *semantic* LLM tree — it's what the Studio
 * Sectioning view shows and what section-edit endpoints operate on, and it
 * survives render-strategy changes untouched.
 *
 * Fixed-layout books, however, render from a *positioned* tree whose node ids
 * match the absolutely-positioned `data-id`s in the rendered HTML. That tree is
 * stored separately, in `fixed-layout-sectioning`, so it never clobbers the
 * semantic tree. The whole content pipeline (web-rendering, text-catalog,
 * packaging, TTS, easy-read, glossary, toc, captions, quizzes) must read the
 * tree that matches the rendered HTML, so it goes through this resolver.
 *
 * Selection is by node presence rather than config: `fixed-layout-sectioning`
 * and its rendering are retained during rerun preparation. Successful reflowable
 * publication invalidates the positioned tree for that page atomically with
 * replacement HTML. A failed strategy switch therefore leaves the prior pair
 * readable; successful fixed-layout publication writes both in one transaction.
 */
import type { NodeDataRow, Storage } from "@adt/storage"
import type { PageSectioningOutput, PageSectioningSection, SectionRendering, PackagingWarning, ContentNodeData } from "@adt/types"
import { PageSectioningOutput as PageSectioningOutputSchema, WebRenderingOutput } from "@adt/types"
import { parseDocument, DomUtils } from "htmlparser2"

export const FIXED_LAYOUT_SECTIONING_NODE = "fixed-layout-sectioning"
export const PAGE_SECTIONING_NODE = "page-sectioning"

/** Older fixed-layout books stored their positioned tree in the semantic slot.
 * A reflow renderer must not reinterpret that tree as semantic sectioning. */
export function assertReflowableSectioning(sectioning: PageSectioningOutput): void {
  if (sectioning.sections.some(section => section.sectionType === "fixed-layout-page" && section.viewport && section.placement)) {
    throw new Error("Run Sectioning before switching this legacy fixed-layout page to reflowable layout. Existing content has been preserved.")
  }
}

/** Resolve explicit ownership, never overriding contradictory declarations. */
export function renderedSectionId(rendering: SectionRendering): string | undefined {
  const doc = parseDocument(rendering.html)
  const owners = DomUtils.findAll((element) => element.type === "tag" && element.attribs["data-section-id"] !== undefined, doc.children)
  if (owners.length > 1) return undefined
  const root = owners[0]
  const htmlId = root?.attribs["data-section-id"]
  if (htmlId === "" || (htmlId && rendering.sectionId && htmlId !== rendering.sectionId)) return undefined
  // A persisted owner covers the complete rendering, including decorative
  // siblings. Only unstamped legacy HTML needs the exclusive-root check below.
  if (rendering.sectionId) return rendering.sectionId
  // A layout wrapper is fine; an owner on only one descendant must not claim
  // sibling text or another activity outside that section.
  let child: (typeof doc.children)[number] | typeof doc | undefined = root
  for (let ancestor = child?.parent; ancestor; ancestor = ancestor.parent) {
    if (ancestor.children.some((sibling) => sibling !== child && (
      (sibling.type === "text" && sibling.data.trim().length > 0) ||
      (sibling.type === "tag" && sibling.name !== "head")
    ))) return undefined
    child = ancestor
  }
  return htmlId
}

/** Read-only compatibility for develop's fixed-layout output. A positioned page
 * has exactly one fixed section and one rendering; unlike a reflowable page it
 * cannot have reordered section owners. Never infer ownership for other shapes
 * or override explicit (possibly contradictory) ownership evidence. */
function withLegacyFixedLayoutOwnership(
  storage: Storage, pageId: string, rendering: WebRenderingOutput,
): WebRenderingOutput {
  if (rendering.sections.length !== 1) return rendering
  const entry = rendering.sections[0]
  if (entry.sectionId || entry.html.includes("data-section-id")) return rendering
  const dedicated = storage.getLatestNodeData(FIXED_LAYOUT_SECTIONING_NODE, pageId)
  const fixed = PageSectioningOutputSchema.safeParse((dedicated ?? storage.getLatestNodeData(PAGE_SECTIONING_NODE, pageId))?.data)
  if (!fixed.success || fixed.data.sections.length !== 1) return rendering
  // v0.7.2/v0.7.3 wrote the positioned tree to page-sectioning. A generic
  // single semantic section does not prove ownership; require that producer's
  // fixed type and positioned sidecars when the dedicated node is absent.
  const section = fixed.data.sections[0]
  if (!dedicated && (section.sectionType !== "fixed-layout-page" || !section.viewport || !section.placement || entry.sectionType !== "fixed-layout-page")) return rendering
  const doc = parseDocument(entry.html)
  const roots = DomUtils.findAll((element) => element.type === "tag" && element.attribs.id === "content", doc.children)
  if (roots.length !== 1) return rendering
  const sectionId = fixed.data.sections[0].sectionId
  roots[0].attribs["data-section-id"] = sectionId
  return { ...rendering, sections: [{ ...entry, sectionId, html: DomUtils.getOuterHTML(doc) }] }
}

/** Read-only legacy compatibility, not historical proof. Whole content trees
 * can move; SPEC-0001 explicitly accepts that limitation. Match the complete
 * leaf set, never synthetic containers, array positions, or historical logs. */
export function withLegacyRenderingOwnership(storage: Storage, pageId: string, rendering: WebRenderingOutput, alignToSource = false): WebRenderingOutput {
  const projected = withLegacyFixedLayoutOwnership(storage, pageId, rendering)
  const sections = getRenderSectioning(storage, pageId)?.sections ?? []
  const declarations = projected.sections.map(entry => {
    const elements = DomUtils.findAll(element => element.type === "tag", parseDocument(entry.html).children)
    const owners = elements.filter(element => element.attribs["data-section-id"] !== undefined)
      .map(element => element.attribs["data-section-id"])
    return {
      entry,
      legacy: entry.sectionId === undefined && owners.length === 0,
      owners: [...owners, ...(entry.sectionId === undefined ? [] : [entry.sectionId])],
      ids: new Set(elements.map(element => element.attribs["data-id"]).filter(Boolean)),
    }
  })
  // Even a contradictory explicit declaration reserves its IDs. A legacy
  // rendering cannot silently take either side of that unresolved claim.
  const claimed = new Set(declarations.flatMap(value => value.owners))
  const leaves = (nodes: readonly ContentNodeData[]): string[] => nodes.flatMap(node =>
    node.children?.length ? leaves(node.children) : !node.structure && node.role ? [node.nodeId] : [])
  const sources = sections.map(section => ({ section, ids: leaves(section.nodes) }))
    .filter(({ section, ids }) => section.sectionId && !claimed.has(section.sectionId) && ids.length > 0 &&
      sections.filter(other => other.sectionId === section.sectionId).length === 1)
  const candidates = declarations.map(value => value.legacy
    ? sources.filter(({ section, ids }) => section.sectionType === value.entry.sectionType && ids.every(id => value.ids.has(id)))
    : [])
  // Compute every edge before assigning anything. An ambiguous rendering still
  // competes for each qualifying source, so traversal order cannot pick winners.
  const resolved = declarations.map((value, index) => {
    const matches = candidates[index]
    if (matches.length !== 1) return value.entry
    const match = matches[0]
    if (candidates.some((other, otherIndex) => otherIndex !== index && other.includes(match))) return value.entry
    return { ...value.entry, sectionId: match.section.sectionId }
  })
  // Editor routes address current source indices. Reader/export ordering keeps
  // its existing rendered order; neither path uses position to establish owner.
  return { ...projected, sections: alignToSource ? resolved.map(entry => {
    const owner = renderedSectionId(entry)
    const indexes = sections.flatMap((section, index) => section.sectionId === owner ? [index] : [])
    return indexes.length === 1 ? { ...entry, sectionIndex: indexes[0] } : entry
  }) : resolved }

}

export function resolveRenderedSection(
  rendering: SectionRendering,
  sections: readonly PageSectioningSection[] | undefined,
): PageSectioningSection | undefined {
  const id = renderedSectionId(rendering)
  if (!id) return undefined
  const matches = sections?.filter((section) => section.sectionId === id)
  return matches?.length === 1 ? matches[0] : undefined
}

/** Shared omission disclosure for preview, API and packaged output. */
export function renderingOwnershipWarnings(storage: Storage): PackagingWarning[] {
  return storage.getPages().flatMap((page) => {
    const rendering = WebRenderingOutput.safeParse(storage.getLatestNodeData("web-rendering", page.pageId)?.data)
    if (!rendering.success) return []
    const sections = getRenderSectioning(storage, page.pageId)?.sections
    return withLegacyRenderingOwnership(storage, page.pageId, rendering.data).sections.filter((entry) => !resolveRenderedSection(entry, sections))
      .map((entry) => ({ kind: "orphaned-rendering" as const, pageId: page.pageId, sectionIndex: entry.sectionIndex }))
  })
}

/**
 * The latest sectioning row a page is CURRENTLY rendered from: the positioned
 * `fixed-layout-sectioning` when present, else the semantic `page-sectioning`.
 * Returns the raw row so callers that need the version still have it.
 */
export function getRenderSectioningRow(
  storage: Storage,
  pageId: string,
): NodeDataRow | null {
  return getRenderSectioningSelection(storage, pageId)?.row ?? null
}

/** Versions are scoped to a node: switching source nodes can keep version 1. */
export function getRenderSectioningSelection(storage: Storage, pageId: string) {
  const fixed = storage.getLatestNodeData(FIXED_LAYOUT_SECTIONING_NODE, pageId)
  if (fixed) return { node: FIXED_LAYOUT_SECTIONING_NODE, row: fixed } as const
  const semantic = storage.getLatestNodeData(PAGE_SECTIONING_NODE, pageId)
  return semantic ? { node: PAGE_SECTIONING_NODE, row: semantic } as const : null
}

/** Parsed convenience wrapper around {@link getRenderSectioningRow}. */
export function getRenderSectioning(
  storage: Storage,
  pageId: string,
): PageSectioningOutput | undefined {
  const row = getRenderSectioningRow(storage, pageId)
  if (!row) return undefined
  const parsed = PageSectioningOutputSchema.safeParse(row.data)
  return parsed.success ? parsed.data : undefined
}

/**
 * The semantic `page-sectioning` tree, regardless of render strategy. Unlike
 * {@link getRenderSectioning} this never returns the positioned fixed-layout
 * tree, so callers that need semantic roles (e.g. `heading`) — absent from the
 * positioned tree — read from here.
 */
export function getSemanticSectioning(
  storage: Storage,
  pageId: string,
): PageSectioningOutput | undefined {
  const row = storage.getLatestNodeData(PAGE_SECTIONING_NODE, pageId)
  if (!row) return undefined
  const parsed = PageSectioningOutputSchema.safeParse(row.data)
  return parsed.success ? parsed.data : undefined
}
