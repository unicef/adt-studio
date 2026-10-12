import { createPromptEngine, promptRoots } from "@adt/llm"
import path from "node:path"
import { createBookStorage, writeSectioningLifecycle, readSectioningLifecycle, readExtractionManifest } from "@adt/storage"
import { OutputMetadata, STAGE_BY_NAME, type ProgressEvent, type StageName } from "@adt/types"
import { loadBookConfig } from "./config.js"
import { GENERATION_NODES, generationStage, isGenerationKind, readGenerationCatalog, type GenerationCatalogOptions } from "./generation-catalog.js"
import { assertOutputPublication, inputSignature, outputEvidence, selectedForGeneration } from "./output-freshness.js"
import { createGenerationPublication } from "./generation-publication.js"
import { assertPersistedSectioning, completeSectioning, effectiveSectioningMode, prepareSectioningRun } from "./sectioning-lifecycle.js"
import type { StageRunOptions, StageRunProgress } from "./stage-execution-options.js"

/** Shared executor adapter: selection, lineage, authorship and publication use
 * the same contracts as catalog outputs. No pre-run clear, identity reset or
 * guessed legacy adoption occurs here. */
export async function runGenerationStage(label: string, options: StageRunOptions, stage: StageName, progress: StageRunProgress,
  execute: (options: StageRunOptions, progress: StageRunProgress) => Promise<void>): Promise<void> {
  const base = createBookStorage(label, options.booksDir)
  const bookDir = path.join(path.resolve(options.booksDir), label)
  const context = (storage = base): GenerationCatalogOptions => ({ storage, bookDir, config: loadBookConfig(label, options.booksDir, options.configPath), promptsDir: options.promptsDir, promptOverridesDir: options.promptOverridesDir, templatesDir: options.templatesDir, configPath: options.configPath, webAssetsDir: options.webAssetsDir, configDir: options.configDir })
  try {
    const read = () => readGenerationCatalog(context()).filter((status) => isGenerationKind(status.identity.kind) && generationStage(status.identity.kind) === stage)
    const promptEngine = createPromptEngine(promptRoots(options.booksDir, options.promptsDir, options.promptOverridesDir, path.join(bookDir, "prompts")), { basePromptModelId: context().config.base_prompt_model, capture: true })
    let before = readGenerationCatalog({ ...context(), promptEngine }).filter((status) => isGenerationKind(status.identity.kind) && generationStage(status.identity.kind) === stage)
    const selected = before.filter((status) => selectedForGeneration(status, undefined, options.outputScope))
    if (!selected.length) return
    if (stage !== "extract") prepareSectioningRun(label, options.booksDir, stage, stage, options.configPath)
    const config = context().config
    let versions = inputSignature(base.getNodeVersionFingerprint())
    const sourceIds = new Set(readExtractionManifest(bookDir)?.images.map((image) => image.imageId) ?? [])
    const sourceView = stage === "extract" ? { ...base, getPageImages: (pageId: string) => base.getPageImages(pageId).filter((image) => sourceIds.has(image.imageId)) } : base
    const validate = () => {
      options.signal?.throwIfAborted()
      if (inputSignature(base.getNodeVersionFingerprint()) !== versions) throw new Error("Content changed during generation. Previous output is retained.")
      assertOutputPublication(before, read(), selected.map((status) => status.identity))
    }
    let retainedProtected = false
    const publication = createGenerationPublication(sourceView, validate)
    const checkpoint = stage === "extract" ? (pageId: string) => {
      validate()
      // Only this page and prerequisite book outputs become visible. Other
      // pages remain staged. Evidence identifies a partial, never current run.
      const row = publication.storage.getLatestNodeData("metadata", "book")
      if (!row) throw new Error("Missing extraction metadata")
      const view = { ...publication.storage,
        getLatestNodeData: (node: string, id: string) => id === pageId || id === "book"
          ? publication.storage.getLatestNodeData(node, id) : base.getLatestNodeData(node, id),
      }
      const output = readGenerationCatalog({ ...context(view), promptEngine }).find((value) => value.identity.kind === "extract-generation")!
      publication.storage.putNodeData("metadata", "book", { ...(row.data as object), generationEvidence: {
        ...(retainedProtected ? {} : { source: "ai" }), incomplete: true, input: { ...outputEvidence(output.signature, null), contentHash: output.contentHash },
      } })
      publication.publish(new Set(["book", pageId]))
      versions = inputSignature(base.getNodeVersionFingerprint())
      before = read().map((status) => ({ ...status, signature: before.find((old) => old.identity.kind === status.identity.kind && old.identity.id === status.identity.id)?.signature ?? status.signature }))
    } : undefined
    const selectedIds = selected.map((status) => status.identity.id)
    const explicit = selected.filter((status) => status.protected).flatMap((status) => {
      const node = isGenerationKind(status.identity.kind) ? GENERATION_NODES[status.identity.kind] : undefined
      if (node !== "page-sectioning" && node !== "toc-generation") return []
      return [{ node, itemId: status.identity.id, version: base.getLatestNodeData(node, status.identity.id)!.version }]
    })
    const completionEvents: ProgressEvent[] = []
    await execute({ ...options, promptEngine, generationStorage: publication.storage,
      generationRetainedProtected: () => { retainedProtected = true }, generationCheckpoint: checkpoint, validateGeneration: validate, discardGenerationPage: (id) => publication.discardPage(id),
      generationReplaceProtected: selected.some((status) => status.protected),
      generationExtractTrusted: stage === "extract" && before.every((status) => !status.protected),
      generationPageIds: stage === "sectioning" || stage === "storyboard" ? selectedIds : undefined,
      ...(explicit.length ? { replaceManual: true, protectedReplacements: explicit } : {}),
    }, { emit(event) {
      if (event.type === "step-complete" || event.type === "step-skip") completionEvents.push(event)
      else if (event.type !== "stage-complete") progress.emit(event)
    } })
    options.signal?.throwIfAborted()
    const after = readGenerationCatalog({ ...context(publication.storage), promptEngine })
    for (const status of selected) {
      if (!isGenerationKind(status.identity.kind)) continue
      const node = GENERATION_NODES[status.identity.kind], id = status.identity.id
      const row = publication.storage.getLatestNodeData(node, id)
      const output = after.find((value) => value.identity.kind === status.identity.kind && value.identity.id === id)
      if (!row || !output?.usable || !publication.hasWritten(node, id)) throw new Error("Generation did not produce its required output")
      publication.storage.putNodeData(node, id, { ...(row.data as object), generationEvidence: { ...(retainedProtected ? {} : { source: "ai", input: { ...outputEvidence(output.signature, null), contentHash: output.contentHash } }), ...(stage === "extract" && base.getPageRecovery().some((error) => error.step === "image-meaningfulness" || error.step === "image-filtering") ? { incomplete: true } : {}) } })
    }
    // Revoke rendering readiness immediately before the content transaction.
    // A crash after commit keeps the barrier; a rolled-back publication restores
    // the prior lifecycle. Provider failures never reach this boundary.
    const priorLifecycle = readSectioningLifecycle(bookDir)
    let published = false
    try {
      if (stage === "sectioning") writeSectioningLifecycle(bookDir, effectiveSectioningMode(config), false, true)
      publication.publish()
      published = true
    } catch (error) {
      if (!published && stage === "sectioning" && priorLifecycle) writeSectioningLifecycle(bookDir, priorLifecycle.mode, priorLifecycle.sectioningReady, priorLifecycle.storyboardPending)
      throw error
    }
    if (stage === "sectioning") completeSectioning(label, options.booksDir, config, options.configPath)
    if (stage === "storyboard" && read().every((status) => status.current && generatedForCurrentInputs(base, status))) writeSectioningLifecycle(bookDir, effectiveSectioningMode(config), true, false)
    completionEvents.forEach((event) => progress.emit(event))
    progress.emit({ type: "stage-complete", stage })
  } catch (error) {
    if (!options.signal?.aborted) for (const step of STAGE_BY_NAME[stage].steps) base.recordStepError(step.name, error instanceof Error ? error.message : "Generation failed")
    throw error
  } finally { base.close() }
}

/** A crash between content commit and lifecycle publication is repaired only
 * from complete, current generation evidence and the persisted mode preflight. */
export function reconcileCurrentGeneration(label: string, options: StageRunOptions, stage: StageName): void {
  if (stage !== "sectioning" && stage !== "storyboard") return
  const base = createBookStorage(label, options.booksDir)
  const bookDir = path.join(path.resolve(options.booksDir), label)
  try {
    const config = loadBookConfig(label, options.booksDir, options.configPath)
    const statuses = readGenerationCatalog({ storage: base, config, bookDir, promptsDir: options.promptsDir, promptOverridesDir: options.promptOverridesDir, templatesDir: options.templatesDir, configPath: options.configPath })
      .filter((status) => status.identity.kind === stage)
    if (!statuses.length || !statuses.every((status) => status.current)) return
    assertPersistedSectioning(base, config, bookDir)
    const lifecycle = readSectioningLifecycle(bookDir), mode = effectiveSectioningMode(config)
    if (stage === "sectioning" && (!lifecycle?.sectioningReady || lifecycle.mode !== mode)) completeSectioning(label, options.booksDir, config, options.configPath)
    if (stage === "storyboard" && lifecycle?.sectioningReady && lifecycle.mode === mode && lifecycle.storyboardPending && statuses.every((status) => generatedForCurrentInputs(base, status))) writeSectioningLifecycle(bookDir, mode, true, false)
  } finally { base.close() }
}

function generatedForCurrentInputs(storage: import("@adt/storage").Storage, status: import("@adt/types").OutputStatus): boolean {
  if (!isGenerationKind(status.identity.kind)) return false
  const row = storage.getLatestNodeData(GENERATION_NODES[status.identity.kind], status.identity.id)?.data as { generationEvidence?: unknown } | undefined
  const metadata = OutputMetadata.safeParse(row?.generationEvidence)
  return metadata.success && metadata.data.input?.signature === status.signature && metadata.data.input.contentHash === status.contentHash
}
