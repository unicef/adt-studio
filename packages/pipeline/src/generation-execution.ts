import path from "node:path"
import { createBookStorage, readExtractionManifest } from "@adt/storage"
import { STAGE_BY_NAME, type ProgressEvent, type StageName } from "@adt/types"
import { loadBookConfig } from "./config.js"
import { annotateGeneration, GENERATION_NODES, generationStage, isGenerationKind, readGenerationCatalog, type GenerationCatalogOptions } from "./generation-catalog.js"
import { assertOutputPublication, inputSignature, outputEvidence, selectedForGeneration, selectedOutput, outputSkipped } from "./output-freshness.js"
import { createGenerationPublication } from "./generation-publication.js"
import { prepareSectioningRun, activeSectioningPages } from "./sectioning-lifecycle.js"
import { selectSectioningPages, assertAuthoredReplacement, replacementConfirmed } from "./authored-output.js"
import type { StageRunOptions, StageRunProgress } from "./stage-execution-options.js"

/** Shared executor adapter: selection, lineage, authorship and publication use
 * the same contracts as catalog outputs. No pre-run clear, identity reset or
 * guessed legacy adoption occurs here. */
export async function runGenerationStage(label: string, options: StageRunOptions, stage: StageName, progress: StageRunProgress,
  execute: (options: StageRunOptions, progress: StageRunProgress) => Promise<void>): Promise<void> {
  const base = createBookStorage(label, options.booksDir)
  const bookDir = path.join(path.resolve(options.booksDir), label)
  const context = (storage = base): GenerationCatalogOptions => ({ kinds: [stage === "extract" ? "extract-generation" : stage as import("./generation-catalog.js").GenerationKind], storage, bookDir, config: loadBookConfig(label, options.booksDir, options.configPath), promptsDir: options.promptsDir, templatesDir: options.templatesDir, configPath: options.configPath, webAssetsDir: options.webAssetsDir, configDir: options.configDir })
  try {
    const read = () => readGenerationCatalog(context()).filter((status) => isGenerationKind(status.identity.kind) && generationStage(status.identity.kind) === stage)
    let before = read()
    // Whole-request consent was validated before any execution. Recheck the
    // stage's own records now: earlier successful Sectioning intentionally
    // advanced its semantic/rendering versions, and must not invalidate a
    // later TOC decision advanced only by that same-run retirement transaction.
    const stageReplacements = options.protectedReplacements?.filter((record) =>
      stage === "sectioning" ? record.node === "page-sectioning" : stage === "toc" && record.node === "toc-generation")
    if (stageReplacements?.length) assertAuthoredReplacement(base, { ...options, fromStage: stage, toStage: stage, protectedReplacements: stageReplacements })
    const sectioningIds = new Set(stage === "sectioning" ? selectSectioningPages(base, activeSectioningPages(base, context().config, bookDir), options).map((page) => page.pageId) : [])
    if (options.outputScope?.replace?.some((record) => (record.identity.kind === "quizzes" || record.identity.kind === "glossary") && record.identity.id !== "book")) {
      throw new Error("Use the existing item editor replacement action for an individual quiz or glossary term.")
    }
    const selected = before.filter((status) => stage === "sectioning"
      ? selectedOutput(status, options.outputScope?.selection) && sectioningIds.has(status.identity.id) && !options.outputScope?.skip?.some((id) => id.kind === "sectioning" && id.id === status.identity.id)
      : selectedOutput(status, options.outputScope?.selection) && !outputSkipped(options.outputScope, status.identity) && (stage === "toc" && replacementConfirmed(options, "toc-generation", "book", base.getSelectedNodeVersion("toc-generation", "book") ?? 0) || selectedForGeneration(status, undefined, options.outputScope)))
    if (!selected.length) return
    if (stage !== "extract") prepareSectioningRun(label, options.booksDir, stage, stage, options.configPath)
    if (stage === "sectioning" || stage === "storyboard") {
      // The shared page executor owns reset and HTML/tree publication. Never
      // wrap it in the book-unit staging adapter: successful pages must be
      // visible immediately and survive subsequent failure/cancellation.
      const selectedIds = new Set(selected.map((status) => status.identity.id))
      let validated = new Set<string>()
      const validatePage = (id: string) => {
        if (outputSkipped(options.outputScope, { kind: stage, id })) throw new Error("Selected output was skipped before publication")
        if (validated.has(id)) return
        const prior = before.find((status) => status.identity.id === id)!
        const now = read().find((status) => status.identity.id === id)!
        assertOutputPublication([prior], [now], [prior.identity])
        validated.add(id)
      }
      const storage = { ...base, close() {}, transaction<T>(operation: () => T): T {
        const parent = validated
        validated = new Set()
        try { return base.transaction(operation) } finally { validated = parent }
      }, putNodeData(node: string, id: string, data: unknown) {
        if (stage === "sectioning" && node === "book-outline" && id === "book") {
          // An assembled book can rebuild its own outline before Sectioning.
          // Revalidate the captured inputs before that write, then bind the
          // page publication plan to this invocation's committed new outline.
          assertOutputPublication(before, read(), selected.map((status) => status.identity))
          const version = base.putNodeData(node, id, data)
          before = read()
          return version
        }
        if (selectedIds.has(id) && (node === GENERATION_NODES[stage] || stage === "storyboard" && node === "fixed-layout-sectioning")) validatePage(id)
        if (node !== GENERATION_NODES[stage] || data == null || !selectedIds.has(id)) return base.putNodeData(node, id, data)
        options.signal?.throwIfAborted()
        return base.putNodeData(node, id, annotateGeneration(context(), stage, id, data as object))
      } }
      await execute({ ...options, generationStorage: storage, generationPageIds: [...selectedIds] }, progress)
      return
    }
    const versions = inputSignature(base.getNodeVersionFingerprint())
    const sourceIds = new Set(readExtractionManifest(bookDir)?.images.map((image) => image.imageId) ?? [])
    const sourceView = stage === "extract" ? { ...base, getPageImages: (pageId: string) => base.getPageImages(pageId).filter((image) => sourceIds.has(image.imageId)) } : base
    const publication = createGenerationPublication(sourceView, () => {
      options.signal?.throwIfAborted()
      if (selected.some((status) => outputSkipped(options.outputScope, status.identity))) throw new Error("Selected output was skipped before publication")
      if (inputSignature(base.getNodeVersionFingerprint()) !== versions) throw new Error("Content changed during generation. Previous output is retained.")
      assertOutputPublication(before, read(), selected.map((status) => status.identity))
    })
    const selectedIds = selected.map((status) => status.identity.id)
    const explicit = selected.filter((status) => status.protected).flatMap((status) => {
      const node = isGenerationKind(status.identity.kind) ? GENERATION_NODES[status.identity.kind] : undefined
      if (node !== "page-sectioning" && node !== "toc-generation") return []
      return [{ node, itemId: status.identity.id, version: base.getLatestNodeData(node, status.identity.id)!.version }]
    })
    const completionEvents: ProgressEvent[] = []
    await execute({ ...options, generationStorage: publication.storage,
      generationReplaceProtected: stage !== "quizzes" && stage !== "glossary" && selected.some((status) => options.outputScope?.replace?.some((record) => record.identity.kind === status.identity.kind && record.identity.id === status.identity.id)),
      generationPageIds: undefined,
      ...(explicit.length && !options.replaceManual ? { replaceManual: true, protectedReplacements: explicit } : {}),
    }, { emit(event) {
      if (event.type === "step-complete" || event.type === "step-skip") completionEvents.push(event)
      else if (event.type !== "stage-complete") progress.emit(event)
    } })
    options.signal?.throwIfAborted()
    const after = readGenerationCatalog(context(publication.storage))
    for (const status of selected) {
      if (!isGenerationKind(status.identity.kind)) continue
      const node = GENERATION_NODES[status.identity.kind], id = status.identity.id
      const row = publication.storage.getLatestNodeData(node, id)
      const output = after.find((value) => value.identity.kind === status.identity.kind && value.identity.id === id)
      if (!row || !output?.usable || !publication.hasWritten(node, id)) throw new Error("Generation did not produce its required output")
      publication.annotate(node, id, { ...(row.data as object), generationEvidence: { source: "ai", input: { ...outputEvidence(output.signature, null), contentHash: output.contentHash } } })
    }
    publication.publish()
    completionEvents.forEach((event) => progress.emit(event))
    progress.emit({ type: "stage-complete", stage })
  } catch (error) {
    if (!options.signal?.aborted) for (const step of STAGE_BY_NAME[stage].steps) base.recordStepError(step.name, error instanceof Error ? error.message : "Generation failed")
    throw error
  } finally { base.close() }
}

