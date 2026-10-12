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
 * Selection follows published output rather than config. Fixed rendering
 * publishes its positioned tree alongside HTML. Reflowable publication appends
 * a null positioned-tree version in that same transaction, retaining the old
 * tree in history. A config change alone never switches the active tree.
 */
import type { NodeDataRow, Storage } from "@adt/storage"
import type { PageSectioningOutput, PageSectioningSection, SectionRendering, PackagingWarning } from "@adt/types"
import { PageSectioningOutput as PageSectioningOutputSchema, WebRenderingOutput } from "@adt/types"
import { parseDocument, DomUtils } from "htmlparser2"

export const FIXED_LAYOUT_SECTIONING_NODE = "fixed-layout-sectioning"
export const PAGE_SECTIONING_NODE = "page-sectioning"

/** Resolve the owner of retained HTML, independently of the latest source order.
 * Adapted from SPEC-0012's stable HTML identity rule (PR #888). Identityless or
 * contradictory legacy content is retained but cannot be assigned to a section:
 * even matching leaf IDs may have moved since this rendering was produced.
 */
export function renderedSectionId(rendering: SectionRendering): string | undefined {
  const doc = parseDocument(rendering.html)
  const owners = DomUtils.findAll((element) => element.type === "tag" && element.attribs["data-section-id"] !== undefined, doc.children)
  if (owners.length > 1) return undefined
  // A layout wrapper is fine; an owner on only one descendant must not claim
  // sibling text or another activity outside that section.
  let child: (typeof doc.children)[number] | typeof doc | undefined = owners[0]
  for (let ancestor = child?.parent; ancestor; ancestor = ancestor.parent) {
    if (ancestor.children.some((sibling) => sibling !== child && (
      (sibling.type === "text" && sibling.data.trim().length > 0) ||
      (sibling.type === "tag" && sibling.name !== "head")
    ))) return undefined
    child = ancestor
  }
  const htmlId = owners[0]?.attribs["data-section-id"]
  if (htmlId === "" || (htmlId && rendering.sectionId && htmlId !== rendering.sectionId)) return undefined
  return rendering.sectionId ?? htmlId
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
    return rendering.data.sections.filter((entry) => !resolveRenderedSection(entry, sections))
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
  const positioned = storage.getLatestNodeData(FIXED_LAYOUT_SECTIONING_NODE, pageId)
  return positioned && positioned.data !== null
    ? positioned
    : storage.getLatestNodeData(PAGE_SECTIONING_NODE, pageId)
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
