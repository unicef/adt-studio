import { SectioningSafetyError } from "./sectioning-lifecycle.js"
import { missingStoryboardInputMessage } from "./storyboard-coverage.js"
import { recoverPackagePublication } from "./packaging/publication.js"
import { isGenerationKind, readGenerationCatalog } from "./generation-catalog.js"
import path from "node:path"
import { OUTPUT_KIND_STEP, STEP_TO_STAGE, STAGE_ORDER, StageName, OutputRunScope, type PipelineResumeSummary } from "@adt/types"
import { assertBookWriter, assertExtractionReadable, createBookStorage, ExtractionAdmissionError, recoverSectioningTransition, resolveBookPaths } from "@adt/storage"
import { prepareExtractionAdmission, extractionOptionsFromConfig } from "./extraction-admission.js"
import { loadBookConfig } from "./config.js"
import { prepareSectioningRun, activeSectioningPages } from "./sectioning-lifecycle.js"
import { readOutputCatalog } from "./output-catalog.js"
import { outputIdentityKey, outputSkipped, selectedForGeneration, selectedOutput } from "./output-freshness.js"
import { assertAuthoredReplacement, selectSectioningPages } from "./authored-output.js"
import type { StageRunOptions, StageRunProgress } from "./stage-execution-options.js"

export class ResumeIncompleteError extends Error {
  readonly code = "RESUME_INCOMPLETE"
  constructor(readonly summary: PipelineResumeSummary) {
    super("RESUME_INCOMPLETE: Requested resume has unresolved outputs. Protected content has been retained. Inspect the resume summary before retrying.")
  }
}

/** No completion flags can establish freshness for an uncovered stage. */
export function catalogResumeStages(from: string, to: string): StageName[] {
  const first = StageName.parse(from), last = StageName.parse(to)
  if (STAGE_ORDER.indexOf(first) > STAGE_ORDER.indexOf(last)) throw new Error("Invalid stage range")
  const stages = STAGE_ORDER.slice(STAGE_ORDER.indexOf(first), STAGE_ORDER.indexOf(last) + 1)
  const supported = new Set(Object.values(OUTPUT_KIND_STEP).map((step) => STEP_TO_STAGE[step]))
  if (stages.some((stage) => !supported.has(stage))) throw new ExtractionAdmissionError("UNSAFE_RESUME_UNAVAILABLE")
  return stages
}

/** The caller keeps the shared writer for admission, planning and publication.
 * Execution delegates to the existing stage functions, with no pre-run clearing.
 * Re-read before each stage and after failure: reports describe persisted output,
 * including durable work from an earlier stage, rather than attempted work.
 */
export async function runCatalogResume(label: string, options: StageRunOptions, progress: StageRunProgress,
  execute: (stage: StageName) => Promise<void>): Promise<void> {
  const { bookDir } = resolveBookPaths(label, options.booksDir)
  assertBookWriter(bookDir)
  options.signal?.throwIfAborted()
  recoverSectioningTransition(bookDir)
  const config = loadBookConfig(label, options.booksDir, options.configPath)
  const verifiesExtraction = options.resume || options.fromStage === "extract"
  if (verifiesExtraction) {
    const admission = prepareExtractionAdmission(bookDir, { ...extractionOptionsFromConfig(path.join(bookDir, `${label}.pdf`), config, bookDir), startPage: options.startPage ?? config.start_page, endPage: options.endPage ?? config.end_page })
    if (admission.outcome !== "reused") throw new ExtractionAdmissionError("EXTRACTION_INCOMPLETE")
  } else assertExtractionReadable(bookDir)
  recoverPackagePublication(bookDir)
  const stages = catalogResumeStages(options.fromStage, options.toStage)
  OutputRunScope.parse(options.outputScope ?? {})
  if (!stages.includes("sectioning") && stages[0] !== "extract") prepareSectioningRun(label, options.booksDir, stages[0], stages[stages.length - 1], options.configPath)
  const storage = createBookStorage(label, options.booksDir)
  try {
    assertAuthoredReplacement(storage, options)
    selectSectioningPages(storage, activeSectioningPages(storage, config, bookDir), options)
    const read = () => {
      const currentConfig = loadBookConfig(label, options.booksDir, options.configPath)
      // Match the existing explicit Easy Read stage's effective configuration.
      if (options.fromStage === "easy-read" && options.toStage === "easy-read") {
        currentConfig.easy_read = { ...currentConfig.easy_read, enabled: true }
      }
      const context = { storage, config: currentConfig, bookDir, promptsDir: options.promptsDir,
        configDir: options.configDir ?? (options.configPath ? path.join(path.dirname(options.configPath), "config") : path.resolve("config")) }
      const kinds = stages.flatMap((stage) => stage === "extract" ? ["extract-generation" as const] : isGenerationKind(stage) ? [stage] : [])
      const needsCatalog = Object.entries(OUTPUT_KIND_STEP).some(([kind, step]) =>
        !isGenerationKind(kind) && stages.includes(STEP_TO_STAGE[step]))
      // Do not evaluate unrelated catalog consumers before a generation-only
      // repair has replaced malformed, known-AI source content.
      const outputs = [
        ...(kinds.length ? readGenerationCatalog({ ...context, kinds, templatesDir: options.templatesDir,
          configPath: options.configPath, webAssetsDir: options.webAssetsDir }) : []),
        ...(needsCatalog ? readOutputCatalog(context) : []),
      ].filter((status) => stages.includes(STEP_TO_STAGE[OUTPUT_KIND_STEP[status.identity.kind]])
        && selectedOutput(status, options.outputScope?.selection))
      if (!outputs.length && !options.outputScope?.selection && !stages.includes("storyboard") && stages.some((stage) => STAGE_ORDER.indexOf(stage) > STAGE_ORDER.indexOf("storyboard"))) {
        // Empty catalog enumeration is not proof that downstream work is done.
        // Retained usable warnings are allowed; absent/invalid source output is
        // an explicit prerequisite gap, including catalog-only continuations.
        const missing = readGenerationCatalog({ kinds: ["storyboard"], storage, config: currentConfig, bookDir, promptsDir: options.promptsDir, templatesDir: options.templatesDir, configPath: options.configPath })
          .filter((status) => !status.usable && !status.excluded)
        outputs.push(...missing)
      }
      return outputs
    }
    const before = new Map(read().map((status) => [outputIdentityKey(status.identity), status]))
    for (const identity of options.outputScope?.selection?.identities ?? []) {
      if (!before.has(outputIdentityKey(identity))) throw new Error("Requested output is unavailable in this resume scope")
    }
    for (const replacement of options.protectedReplacements ?? []) {
      const kind = replacement.node === "page-sectioning" ? "sectioning" : replacement.node === "toc-generation" ? "toc" : undefined
      if (kind && !before.has(outputIdentityKey({ kind, id: replacement.itemId }))) throw new Error("Replacement is outside the requested resume scope")
    }
    if ([...before.values()].some((status) => status.capabilityUnavailable && !status.excluded)) throw new ExtractionAdmissionError("UNSAFE_RESUME_UNAVAILABLE")
    if (options.outputScope?.replace?.some((record) => record.identity.kind === "sectioning")) throw new Error("Sectioning replacement requires exact semantic and Storyboard versions in protectedReplacements.")
    // Validate every explicit decision before any stage can make a paid call.
    for (const replacement of options.outputScope?.replace ?? []) {
      const status = before.get(outputIdentityKey(replacement.identity))
      if (!status) throw new Error("Replacement is outside the requested resume scope")
      selectedForGeneration(status, undefined, options.outputScope)
    }
    const report = (status: PipelineResumeSummary["status"]): PipelineResumeSummary => {
      const outputs = read().map((output): PipelineResumeSummary["outputs"][number] => {
        const previous = before.get(outputIdentityKey(output.identity))
        const changed = !previous || previous.contentHash !== output.contentHash || previous.signature !== output.signature || (!previous.current && output.current)
        const state = output.excluded || outputSkipped(options.outputScope, output.identity) ? "skipped"
          : output.current ? changed ? "completed" : "reused" : "blocked"
        const reason = output.excluded ? "excluded" : outputSkipped(options.outputScope, output.identity) ? "user-skipped"
          : output.current ? changed ? "generated" : "current" : output.protected ? "protected"
          : output.usable && output.warnings.length ? "upstream-warning" : "unresolved"
        return { identity: output.identity, state, reason, usable: output.usable, current: output.current, protected: output.protected }
      })
      return { kind: "catalog-resume", extraction: options.extractionCreated ? "created" : verifiesExtraction ? "verified-reusable" : "not-requested", stages,
        status: status === "complete" && outputs.some((output) => output.state === "blocked" || (output.reason === "user-skipped" && !output.current)) ? "incomplete" : status, outputs }
    }
    try {
      for (const stage of stages) {
        options.signal?.throwIfAborted()
        const outputs = read().filter((output) => STEP_TO_STAGE[OUTPUT_KIND_STEP[output.identity.kind]] === stage)
        if (stage === "package" && read().some((output) => output.identity.kind !== "package" && !output.current && !output.excluded)) continue
        // Catalog adapters also retire removed source membership; their shared
        // per-output planners suppress current/protected provider work.
        const reconcileCatalog = stage === "translate" || stage === "speech"
          || stage === "easy-read" && (config.easy_read?.enabled || options.fromStage === "easy-read" && options.toStage === "easy-read")
        if (reconcileCatalog || (stage === "sectioning" || stage === "toc") && options.replaceManual || outputs.some((output) => selectedForGeneration(output, undefined, options.outputScope))) await execute(stage)
        else if (outputs.every((output) => output.current || output.excluded)) {
          progress.emit({ type: "stage-complete", stage })
        }
        const unavailablePages = outputs.filter((output) => output.identity.kind === "storyboard" && output.blocked && !output.capabilityUnavailable && !output.excluded).map((output) => output.identity.id)
        if (unavailablePages.length) {
          for (const id of unavailablePages) progress.emit({ type: "step-progress", step: "web-rendering", message: missingStoryboardInputMessage([id]) })
          const message = missingStoryboardInputMessage(unavailablePages)
          progress.emit({ type: "step-error", step: "web-rendering", error: message })
          storage.recordStepError("web-rendering", message)
          throw new SectioningSafetyError("STORYBOARD_PAGE_INPUT_MISSING", message)
        }
      }
    } catch (error) {
      if (options.signal?.aborted) storage.clearRunningStepRuns()
      options.onResumeSummary?.(report(options.signal?.aborted ? "cancelled" : "failed"))
      throw error
    }
    const summary = report("complete")
    options.onResumeSummary?.(summary)
    // An ordinary single-stage attempt may finish while retaining usable
    // warnings (SPEC-0001). This never certifies freshness or book completion.
    // Explicit resume/CLI, missing work and failed publication remain strict.
    const retainedWarningsOnly = !verifiesExtraction && stages.length === 1 && read().every((output) =>
      output.current || output.excluded || output.usable && !output.updateNeeded && output.warnings.length > 0 && !output.blocked && !outputSkipped(options.outputScope, output.identity))
    if (summary.status !== "complete" && !retainedWarningsOnly) throw new ResumeIncompleteError(summary)
  } finally { storage.close() }
}
