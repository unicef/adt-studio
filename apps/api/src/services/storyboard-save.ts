import { HTTPException } from "hono/http-exception"
import { assertBookWriter, type Storage } from "@adt/storage"
import {
  classifyStoredSectioning, generatedSectionEvidence, inputSignature, isFixedLayoutBook,
  reconcileTextCatalog, renderedSectionId, retireSectionIds, sectionRenderingContent,
  readGenerationCatalog, type GenerationCatalogOptions,
} from "@adt/pipeline"
import { PageSectioningOutput, WebRenderingOutput, type AppConfig, type StoryboardSaveRequest, type StoryboardSaveResponse, type SectioningSynchronization } from "@adt/types"
import { assertEditVersion } from "./catalog-output-service.js"

function pageGenerationStatus(options: GenerationCatalogOptions, pageId: string) {
  try { return readGenerationCatalog(options).find((value) => value.identity.kind === "storyboard" && value.identity.id === pageId) }
  catch { return undefined } // Unsupported generation inputs cannot certify freshness or block a deterministic edit.
}

export function sectionOwners(storage: Storage): Record<string, string[]> {
  const owners: Record<string, string[]> = Object.create(null)
  for (const page of storage.getPages()) {
    const row = storage.getLatestNodeData("page-sectioning", page.pageId)
    if (!row) continue
    const source = PageSectioningOutput.safeParse(row.data)
    if (!source.success) return {} // An invalid neighbor cannot prove uniqueness.
    for (const section of source.data.sections) if (!section.isPruned) (owners[section.sectionId] ??= []).push(page.pageId)
  }
  return owners
}

export function synchronizationLayout(storage: Storage, pageId: string, config: AppConfig): SectioningSynchronization["layout"] {
  return isFixedLayoutBook(config) || storage.getLatestNodeData("fixed-layout-sectioning", pageId)?.data != null ? "fixed" : "reflowable"
}

export function storedSynchronization(storage: Storage, pageId: string, layout: SectioningSynchronization["layout"], proposed?: PageSectioningOutput) {
  const source = storage.getLatestNodeData("page-sectioning", pageId)
  const rendering = storage.getLatestNodeData("web-rendering", pageId)
  if (!source || !PageSectioningOutput.safeParse(source.data).success) throw new HTTPException(409, { message: "The saved source is missing or invalid. Reload and review the page." })
  return classifyStoredSectioning({ pageId, source, rendering, proposed, layout,
    history: storage.getAllNodeVersions("page-sectioning", pageId), sectionOwners: sectionOwners(storage) })
}

/** Both editor entry points use this one transaction, under shared admission.
 * Client evidence/flags are never copied into trusted provenance. */
export function saveStoryboard(storage: Storage, pageId: string, request: StoryboardSaveRequest, config: AppConfig,
  saveImageAlts?: (rendering: WebRenderingOutput) => void,
  generation?: Omit<GenerationCatalogOptions, "storage" | "config">): StoryboardSaveResponse {
  assertBookWriter(storage.bookDir!)
  if (!storage.getPages().some((page) => page.pageId === pageId)) throw new HTTPException(404, { message: "Page not found" })
  if (storage.getStepRuns().some((run) => run.status === "running")) throw new HTTPException(409, { message: "Wait for the active pipeline task, then reload before saving. Your draft has not been saved." })
  return storage.transaction(() => {
    const sourceRow = storage.getLatestNodeData("page-sectioning", pageId)
    const renderingRow = storage.getLatestNodeData("web-rendering", pageId)
    assertEditVersion(sourceRow?.version, request.baseVersion)
    assertEditVersion(renderingRow?.version, request.renderingVersion)
    const previousSource = PageSectioningOutput.safeParse(sourceRow?.data)
    const source = request.sectioning ? PageSectioningOutput.parse(request.sectioning) : previousSource.success ? previousSource.data : null
    if (!source) throw new HTTPException(409, { message: "Save requires a valid semantic source. Reload and review the page." })
    const previousRendering = WebRenderingOutput.safeParse(renderingRow?.data)
    const pageBefore = generation && previousRendering.success
      ? pageGenerationStatus({ ...generation, storage, config }, pageId)
      : undefined
    const layout = synchronizationLayout(storage, pageId, config)
    const candidate = sourceRow && previousSource.success ? storedSynchronization(storage, pageId, layout, source) : null
    if (layout === "reflowable" && request.rendering && (!previousRendering.success || inputSignature(request.rendering.sections.map(sectionRenderingContent)) !== inputSignature(previousRendering.data.sections.map(sectionRenderingContent)))) {
      const previous = previousRendering.success ? previousRendering.data.sections : []
      const ids = request.rendering.sections.map(renderedSectionId)
      const owners = sectionOwners(storage)
      for (const section of request.rendering.sections) {
        if (previous.some((entry) => inputSignature(sectionRenderingContent(entry)) === inputSignature(sectionRenderingContent(section)))) continue
        const id = renderedSectionId(section)
        if (!id || ids.filter((value) => value === id).length !== 1 || source.sections.filter((entry) => entry.sectionId === id && !entry.isPruned).length !== 1 || (owners[id] ?? []).some((owner) => owner !== pageId)) {
          throw new HTTPException(400, { message: "Edited rendering must retain unique active section identities. Your draft has not been saved." })
        }
      }
      if (ids.some((id) => id && ids.filter((value) => value === id).length > Math.max(1, previous.filter((entry) => renderedSectionId(entry) === id).length))) {
        throw new HTTPException(400, { message: "Edited rendering introduces duplicate section identities. Your draft has not been saved." })
      }
    }

    const sourceContent = (tree: PageSectioningOutput) => ({ ...tree, source: undefined })
    const sourceChanged = !previousSource.success || inputSignature(sourceContent(source)) !== inputSignature(sourceContent(previousSource.data))
    const sourceVersion = sourceChanged ? storage.putNodeData("page-sectioning", pageId, { ...source, source: "manual" }) : sourceRow!.version
    if (sourceChanged && previousSource.success) {
      const active = new Set(source.sections.map((section) => section.sectionId))
      retireSectionIds(storage, previousSource.data.sections.filter((section) => !active.has(section.sectionId)).map((section) => section.sectionId))
    }

    let nextRendering = request.rendering ?? candidate?.rendering ?? (previousRendering.success ? previousRendering.data : null)
    if (nextRendering) {
      nextRendering = { ...nextRendering, generationEvidence: previousRendering.success ? previousRendering.data.generationEvidence : undefined, sections: nextRendering.sections.map((section) => {
        const id = renderedSectionId(section)
        const previous = previousRendering.success ? previousRendering.data.sections.filter((entry) => renderedSectionId(entry) === id) : []
        const expected = candidate?.rendering?.sections.filter((entry) => renderedSectionId(entry) === id) ?? []
        const result = candidate?.sections.find((entry) => entry.sectionId === id)
        const sourceSection = source.sections.find((entry) => entry.sectionId === id)
        const equal = (other: typeof section) => inputSignature(sectionRenderingContent(section)) === inputSignature(sectionRenderingContent(other))
        // Retained historical source references remain valid for unchanged
        // sections. Do not create a rendering version just to advance them.
        if (previous.length === 1 && equal(previous[0])) return previous[0]
        if (sourceSection && expected.length === 1 && equal(expected[0]) && result && ["current", "text-patched"].includes(result.status)) {
          // An already-patched submitted pair is validated against the server's
          // candidate, then written once. No client authorship is trusted.
          return generatedSectionEvidence(section, sourceSection, pageId, sourceVersion)
        }
        return { ...sectionRenderingContent(section), generationEvidence: { source: "manual" as const } }
      }) }
    }
    // Keep the shared full-resume catalog coherent with a deterministic Save.
    // A mixed/manual/unknown page cannot gain whole-page generated provenance.
    if (nextRendering && generation && pageBefore && !pageBefore.protected && previousRendering.success && previousRendering.data.generationEvidence?.input && candidate?.sections.length && candidate.sections.every((section) => ["current", "text-patched"].includes(section.status))
      && nextRendering.sections.every((section) => section.generationEvidence?.source === "ai")
      && inputSignature(nextRendering) !== inputSignature(previousRendering.success ? previousRendering.data : null)) {
      const candidateRendering = nextRendering
      const view: Storage = { ...storage, getLatestNodeData(node, id) {
        return node === "web-rendering" && id === pageId ? { version: request.renderingVersion + 1, data: candidateRendering } : storage.getLatestNodeData(node, id)
      } }
      const status = pageGenerationStatus({ ...generation, storage: view, config }, pageId)
      // Correspondence alone cannot certify changed prompts, typography, model
      // or layout settings. Advance whole-page freshness only from a current
      // generated baseline; otherwise retain its stale signature and protection
      // evidence for the deterministically changed content.
      if (status) nextRendering = { ...nextRendering, generationEvidence: { source: "ai", input: { signature: pageBefore.current ? status.signature : previousRendering.data.generationEvidence.input.signature, contentHash: status.contentHash, references: [{ node: "page-sectioning", itemId: pageId, version: sourceVersion }] } } }
    }
    // Invalid stored data is retained on semantic-only saves, never replaced by
    // a parsed empty document. Evidence-only changes are part of the same write.
    const renderingChanged = !!nextRendering && inputSignature(nextRendering) !== inputSignature(previousRendering.success ? previousRendering.data : renderingRow?.data)
    if (request.rendering && renderingChanged) saveImageAlts?.(request.rendering)
    const renderingVersion = renderingChanged ? storage.putNodeData("web-rendering", pageId, nextRendering) : renderingRow?.version ?? null
    if (sourceChanged || renderingChanged) reconcileTextCatalog(storage, { preserveRendering: true })
    const read = storedSynchronization(storage, pageId, layout)
    return { sectioningVersion: sourceVersion, renderingVersion,
      synchronization: { sourceVersion, renderingVersion, layout, diagnostics: read.diagnostics,
        sections: read.sections.map((result) => candidate?.sections.some((entry) => entry.sectionId === result.sectionId && entry.status === "text-patched") && result.status === "current" ? { ...result, status: "text-patched" } : result) } }
  })
}
