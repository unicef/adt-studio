import type { Storage } from "@adt/storage"
import { PageSectioningOutput, StoryboardSourceState, WebRenderingOutput, type ContentNodeData, type PageSectioningSection } from "@adt/types"
import { DomUtils, parseDocument } from "htmlparser2"
import { inputSignature } from "./output-freshness.js"
import { getRenderSectioning, resolveRenderedSection, withLegacyRenderingOwnership } from "./render-sectioning.js"
import { SOURCE_GENERATION_STATE_NODE, sourceGenerationBasis } from "./source-generation-state.js"

const placeholders = /_{2,}|\[placeholder:[^\]]*\]/g
const normalizedText = (text: string) => text.replace(placeholders, "\uFFFC").replace(/\[\[blank:[^\]]+\]\]/g, "\uFFFC").replace(/\s+/g, " ").trim()

function textEditShape(section: PageSectioningSection) {
  const leaves = new Map<string, string>()
  const visit = (node: ContentNodeData): ContentNodeData => {
    if (node.isPruned || node.role === "image") return node
    if (node.role) { leaves.set(node.nodeId, node.text ?? ""); return { ...node, text: undefined } }
    return { ...node, ...(node.children && { children: node.children.map(visit) }) }
  }
  const shape = sourceGenerationBasis("page-sectioning", { reasoning: "", sections: [{ ...section, nodes: section.nodes.map(visit) }] })
  return { signature: inputSignature(shape), leaves }
}

function renderedLeafTexts(html: string) {
  const doc = parseDocument(html)
  for (const element of DomUtils.findAll(element => ["style", "script"].includes(element.name), doc.children)) DomUtils.removeElement(element)
  for (const element of DomUtils.findAll(element => element.name === "textarea" ||
    (element.name === "input" && ["", "text", "number", "search"].includes(element.attribs.type ?? "")), doc.children)) {
    DomUtils.replaceElement(element, parseDocument("\uFFFC").children[0])
  }
  const texts = new Map<string, string | undefined>()
  for (const element of DomUtils.findAll(element => element.name !== "img" && element.attribs["data-id"] !== undefined, doc.children)) {
    const id = element.attribs["data-id"]
    texts.set(id, texts.has(id) ? undefined : normalizedText(DomUtils.textContent(element)))
  }
  return texts
}

/** A paired editor save may advance source proof only for demonstrably mirrored
 * text changes on an already-current section. The UI flag alone is insufficient
 * (it also covers queued rerenders). Structural changes and existing warnings
 * keep their old proof until actual publication/review. Call in the save txn. */
export function publishSynchronizedStoryboardText(
  storage: Storage, pageId: string, prior: ReturnType<typeof captureStoryboardSource>,
  previousSource: unknown, previousRendering: unknown,
): void {
  if (!prior) return
  const before = PageSectioningOutput.safeParse(previousSource)
  const after = PageSectioningOutput.safeParse(storage.getLatestNodeData("page-sectioning", pageId)?.data)
  const oldHtml = WebRenderingOutput.safeParse(previousRendering)
  const newHtml = WebRenderingOutput.safeParse(storage.getLatestNodeData("web-rendering", pageId)?.data)
  if (!before.success || !after.success || !oldHtml.success || !newHtml.success) return
  const refreshed: string[] = []
  for (const next of after.data.sections) {
    const old = before.data.sections.find(section => section.sectionId === next.sectionId)
    const observed = prior.sections.get(next.sectionId), baseline = prior.baseline?.get(next.sectionId)
    if (!old || next.isPruned || observed?.layout !== "reflowable" ||
      (baseline && (baseline.layout !== observed.layout || baseline.signature !== observed.signature))) continue
    const oldEntry = oldHtml.data.sections.find(entry => resolveRenderedSection(entry, before.data.sections, oldHtml.data.sections) === old)
    const newEntry = newHtml.data.sections.find(entry => resolveRenderedSection(entry, after.data.sections, newHtml.data.sections) === next)
    if (!oldEntry || !newEntry) continue
    const oldShape = textEditShape(old), newShape = textEditShape(next)
    if (oldShape.signature !== newShape.signature) continue
    const changed = [...newShape.leaves].filter(([id, text]) => oldShape.leaves.get(id) !== text)
    if (!changed.length) continue
    const oldTexts = renderedLeafTexts(oldEntry.html), newTexts = renderedLeafTexts(newEntry.html)
    if (changed.every(([id, text]) => {
      const previous = oldShape.leaves.get(id)!
      return inputSignature(previous.match(placeholders)) === inputSignature(text.match(placeholders)) &&
        oldTexts.get(id) === normalizedText(previous) && newTexts.get(id) === normalizedText(text)
    })) refreshed.push(next.sectionId)
  }
  if (refreshed.length) publishStoryboardSource(storage, pageId, { ...prior, baseline: prior.baseline ?? prior.sections }, refreshed)
}

const stateKey = (pageId: string, renderingVersion: number) => JSON.stringify(["web-rendering", pageId, renderingVersion])
function readState(storage: Storage, pageId: string, version: number) {
  try {
    const parsed = StoryboardSourceState.safeParse(storage.getLatestNodeData(SOURCE_GENERATION_STATE_NODE, stateKey(pageId, version))?.data)
    return parsed.success ? new Map(parsed.data.sections.map(section => [section.sectionId, section])) : undefined
  } catch (error) { if (!(error instanceof SyntaxError)) throw error; return undefined }
}
function writeState(storage: Storage, pageId: string, version: number, sections: Map<string, StoryboardSourceState["sections"][number]>) {
  if (!sections.size) return
  storage.putNodeData(SOURCE_GENERATION_STATE_NODE, stateKey(pageId, version), { version: 1, sections: [...sections.values()] } satisfies StoryboardSourceState)
}

/** Source evidence is independent of attempts, config preference and HTML
 * styling. Fixed output consumes the positioned page, never semantic indices. */
export function captureStoryboardSource(storage: Storage, pageId: string) {
  try {
    const row = storage.getLatestNodeData("web-rendering", pageId)
    const rendering = WebRenderingOutput.safeParse(row?.data)
    if (!row || !rendering.success) return undefined
    const source = getRenderSectioning(storage, pageId)
    const semantic = PageSectioningOutput.safeParse(storage.getLatestNodeData("page-sectioning", pageId)?.data)
    const projected = withLegacyRenderingOwnership(storage, pageId, rendering.data)
    const sections = new Map<string, StoryboardSourceState["sections"][number]>()
    for (const entry of projected.sections) {
      const owner = resolveRenderedSection(entry, source?.sections, projected.sections)
      if (!owner || owner.isPruned || !entry.html.trim()) continue
      const fixed = owner.sectionType === "fixed-layout-page" && !!owner.viewport && !!owner.placement
      const tree = fixed ? source : semantic.success ? { ...semantic.data, sections: semantic.data.sections.filter(section => section.sectionId === owner.sectionId) } : null
      sections.set(owner.sectionId, {
        sectionId: owner.sectionId,
        layout: fixed ? "fixed" : "reflowable",
        signature: inputSignature(fixed ? {
          tree: sourceGenerationBasis("fixed-layout-sectioning", tree),
          positioned: storage.getLatestNodeData("positioned-text", pageId)?.data,
          images: storage.getPageImages(pageId),
          filtering: storage.getLatestNodeData("image-filtering", pageId)?.data,
        } : sourceGenerationBasis("page-sectioning", tree)),
      })
    }
    return { version: row.version, sections, baseline: readState(storage, pageId, row.version) }
  } catch (error) { if (!(error instanceof SyntaxError)) throw error; return undefined }
}

/** Observe legacy output immediately before a known source edit/reset. This
 * records no approval/currentness claim and never changes its HTML or version. */
export function rememberStoryboardSource(storage: Storage, pageId: string, observed = captureStoryboardSource(storage, pageId)) {
  if (observed && !observed.baseline) writeState(storage, pageId, observed.version, observed.sections)
}

/** A manual HTML save inherits evidence, never certifies today's source. */
export function inheritStoryboardSource(storage: Storage, pageId: string, previousVersion: number | undefined, nextVersion: number) {
  const prior = previousVersion === undefined ? undefined : readState(storage, pageId, previousVersion)
  if (prior) writeState(storage, pageId, nextVersion, prior)
}

/** Called inside the shared page-pair publication transaction. Untouched
 * sections of a targeted patch keep their old evidence, including warnings. */
export function publishStoryboardSource(storage: Storage, pageId: string, prior: ReturnType<typeof captureStoryboardSource>, refreshedIds?: readonly string[]) {
  const current = captureStoryboardSource(storage, pageId)
  if (!current) return
  const refreshed = refreshedIds && new Set(refreshedIds)
  const sections = new Map<string, StoryboardSourceState["sections"][number]>()
  for (const [id, input] of current.sections) {
    const value = !refreshed || refreshed.has(id) ? input : prior?.baseline?.get(id)
    if (value) sections.set(id, value)
  }
  writeState(storage, pageId, current.version, sections)
}

/** Warning-only projection; missing/ambiguous output is handled by coverage. */
export function storyboardSourceWarnings(storage: Storage, pageIds = storage.getPages().map(page => page.pageId)) {
  return pageIds.flatMap(pageId => {
    const current = captureStoryboardSource(storage, pageId)
    return current && [...current.sections].some(([id, input]) => {
      const prior = current.baseline?.get(id)
      return prior && (prior.layout !== input.layout || prior.signature !== input.signature)
    }) ? [{ kind: "storyboard-source-changed" as const, pageId }] : []
  })
}
