import { TTSOutput, WordTimestampOutput, voiceSlotEntryId } from "@adt/types"
import { parseDocument, DomUtils } from "htmlparser2"
import { publishSpeechOutput, bookAssetExists, type Storage } from "@adt/storage"
import { WebRenderingOutput, type TextCatalogOutput, type GlossaryOutput, type SectionRendering, type OutputLocation } from "@adt/types"
import { buildTextCatalogSnapshot } from "./text-catalog.js"
import { inputSignature } from "./output-freshness.js"
import { rewriteRenderedIdentityReferences } from "./rendered-identity.js"
import { extractImageIds } from "./image-captioning.js"
import { withLegacyRenderingOwnership, getRenderSectioning, renderedSectionId, resolveRenderedSection } from "./render-sectioning.js"

/** Assign newly generated activity leaves real stored identities once. Reading
 * order is never used as identity. Existing authored data IDs are untouched. */
export function assignActivityIds(html: string, allocate: (oldId: string) => string): string {
  const doc = parseDocument(html)
  const elements = DomUtils.findAll((element) => element.type === "tag" && element.attribs?.["data-id"]?.startsWith("activity_gen_"), doc.children)
  if (elements.length === 0) return html
  const assigned = new Map<string, string>()
  for (const element of elements) {
    const id = element.attribs["data-id"]
    // Repeated legacy references keep one scoped identity. Divergent text is
    // reported by the ordinary catalog conflict projection, never a book-wide
    // migration error or a positional reassignment of retained corrections.
    if (!assigned.has(id)) assigned.set(id, allocate(id))
    if (element.attribs["data-correct-items"] !== undefined && element.attribs["data-activity-target"] === undefined) {
      element.attribs["data-activity-target"] = id
    }
    element.attribs["data-id"] = assigned.get(id)!
  }
  return DomUtils.getOuterHTML(doc)
}

export function reconcileActivityIds(storage: Storage, pageId: string): void {
  const row = storage.getLatestNodeData("web-rendering", pageId)
  const parsed = WebRenderingOutput.safeParse(row?.data)
  if (!parsed.success) return
  let changed = false
  const sections = parsed.data.sections.map((section) => {
    const owner = renderedSectionId(section)
    if (!owner) return section
    const next = scopeLegacyActivityIds(section, owner)
    if (next !== section) changed = true
    return next
  })
  if (changed) storage.putNodeData("web-rendering", pageId, { ...parsed.data, sections })
}

/** Complete snapshot only: a partial page response cannot retire unseen IDs.
 * This is metadata reconciliation; no provider, deletion or output replacement. */
export function reconcileTextCatalog(storage: Storage): TextCatalogOutput {
  const catalog = buildTextCatalogSnapshot(storage, storage.getPages())
  const previous = storage.getLatestNodeData("text-catalog", "book")?.data as TextCatalogOutput | undefined
  if (inputSignature(previous?.entries) !== inputSignature(catalog.entries)) {
    const priorIds = new Set(previous?.entries.map((entry) => entry.id))
    const reactivated = new Set(catalog.entries.filter((entry) => !priorIds.has(entry.id)).map((entry) => entry.id))
    restoreReactivatedSpeech(storage, reactivated)
    storage.putNodeData("text-catalog", "book", catalog)
  }
  return catalog
}

/** Discover source assets before a caption exists, including glossary-only
 * images. Shared images keep one identity with all referring selection groups. */
export function buildImageInventory(storage: Storage) {
  const references = new Map<string, { pageIds: Set<string>; sectionIds: Set<string>; glossary: boolean; locations: OutputLocation[]; catalogLocations: Array<{ pageId?: string; sectionId?: string; role: string }> }>()
  const add = (id: string, pageId: string | undefined, sectionId?: string, glossary = false) => {
    const entry = references.get(id) ?? { pageIds: new Set<string>(), sectionIds: new Set<string>(), glossary: false, locations: [], catalogLocations: [] }
    if (pageId) entry.pageIds.add(pageId)
    if (sectionId) entry.sectionIds.add(sectionId)
    entry.glossary ||= glossary
    entry.locations.push({ pageId, sectionId, ...(glossary ? { group: "glossary" as const } : {}), role: "caption" })
    if (!glossary) entry.catalogLocations.push({ pageId, sectionId, role: "caption" })
    references.set(id, entry)
  }
  for (const page of storage.getPages()) {
    const rendering = WebRenderingOutput.safeParse(storage.getLatestNodeData("web-rendering", page.pageId)?.data)
    if (!rendering.success) continue
    const sectioning = getRenderSectioning(storage, page.pageId)
    for (const section of withLegacyRenderingOwnership(storage, page.pageId, rendering.data).sections) {
      const source = resolveRenderedSection(section, sectioning?.sections)
      if (source?.isPruned || (renderedSectionId(section) && sectioning && !source)) continue
      for (const id of extractImageIds([section.html])) add(id, page.pageId, source?.sectionId)
    }
  }
  const glossary = storage.getLatestNodeData("glossary", "book")?.data as GlossaryOutput | undefined
  for (const item of glossary?.items ?? []) {
    if (!item.pruned && item.imageId) add(item.imageId, storage.getImageMeta(item.imageId)?.pageId, undefined, true)
  }
  return [...references].map(([id, refs]) => {
    const meta = storage.getImageMeta(id)
    const available = !!meta && !!storage.bookDir && bookAssetExists(storage.bookDir, meta.relativePath)
    return { id, pageId: meta?.pageId, available, pageIds: [...refs.pageIds], sectionIds: [...refs.sectionIds], glossary: refs.glossary, locations: refs.locations, catalogLocations: refs.catalogLocations }
  })
}

/** Same deterministic legacy projection in catalog, authored saves and output
 * HTML. It cannot transfer old position-keyed corrections to a different leaf. */
export function scopeLegacyActivityIds(section: SectionRendering, sectionId: string): SectionRendering {
  return assignActivitySectionIds(section, (id) => `${sectionId}__${id}`)
}
export function assignActivitySectionIds(section: SectionRendering, allocate: (oldId: string) => string): SectionRendering {
  const mapping = new Map<string, string>()
  let html = assignActivityIds(section.html, (id) => {
    const scoped = allocate(id)
    mapping.set(id, scoped)
    return scoped
  })
  if (!mapping.size) return section
  html = rewriteRenderedIdentityReferences(html, mapping)
  return { ...section, html }
}

export function authoredImageAlts(rendering: WebRenderingOutput, onConflict?: (id: string, alt: string) => void): Map<string, string> {
  const values = new Map<string, string>()
  for (const section of rendering.sections) {
    const doc = parseDocument(section.html)
    for (const element of DomUtils.findAll((element) => element.name === "img" && !!element.attribs["data-id"], doc.children)) {
      const id = element.attribs["data-id"]
      const alt = element.attribs.alt
      if (alt === undefined) continue
      if (values.has(id) && values.get(id) !== alt) { onConflict?.(id, alt); continue }
      values.set(id, alt)
    }
  }
  return values
}


function restoreReactivatedSpeech(storage: Storage, active: Set<string>): void {
  if (!active.size || !storage.bookDir) return
  for (const language of storage.getNodeItemIds("tts")) {
    const current = TTSOutput.safeParse(storage.getLatestNodeData("tts", language)?.data)
    if (!current.success) continue
    const entries = new Map(current.data.entries.map((entry) => [voiceSlotEntryId(entry.textId, entry.voiceSlot), entry]))
    const timing = WordTimestampOutput.safeParse(storage.getLatestNodeData("tts-timestamps", language)?.data)
    const timings = { ...(timing.success ? timing.data.entries : {}) }
    let changed = false
    for (const row of storage.getAllNodeVersions("tts", language).sort((a, b) => b.version - a.version)) {
      const historical = TTSOutput.safeParse(row.data)
      if (!historical.success) continue
      for (const entry of historical.data.entries) {
        const key = voiceSlotEntryId(entry.textId, entry.voiceSlot)
        if (!active.has(entry.textId) || entries.has(key)) continue
        if (!bookAssetExists(storage.bookDir, `audio/${language}/${entry.fileName}`)) continue
        entries.set(key, entry)
        changed = true
        const pair = historical.data.timingVersion == null ? undefined : storage.getAllNodeVersions("tts-timestamps", language).find((version) => version.version === historical.data.timingVersion)
        const parsed = WordTimestampOutput.safeParse(pair?.data)
        if (parsed.success && parsed.data.entries[key]?.audioHash === entry.audioHash) timings[key] = parsed.data.entries[key]
      }
    }
    if (changed) publishSpeechOutput(storage, language, { ...current.data, entries: [...entries.values()] }, { entries: timings, generatedAt: new Date().toISOString() })
  }
}
