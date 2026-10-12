import { recoverPackagePublication } from "./packaging/publication.js"
import { reconcileCurrentGeneration } from "./generation-execution.js"
import { isGenerationKind, readGenerationCatalog } from "./generation-catalog.js"
import path from "node:path"
import { OUTPUT_KIND_STEP, STEP_TO_STAGE, STAGE_ORDER, StageName, OutputRunScope, type PipelineResumeSummary } from "@adt/types"
import { assertBookWriter, createBookStorage, ExtractionAdmissionError, recoverSectioningTransition, resolveBookPaths } from "@adt/storage"
import { prepareExtractionAdmission, extractionOptionsFromConfig } from "./extraction-admission.js"
import { loadBookConfig } from "./config.js"
import { prepareSectioningRun, assertSectioningCurrent } from "./sectioning-lifecycle.js"
import { readOutputCatalog } from "./output-catalog.js"
import { outputIdentityKey, outputSkipped, selectedForGeneration, selectedOutput } from "./output-freshness.js"
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
  const admission = prepareExtractionAdmission(bookDir, { ...extractionOptionsFromConfig(path.join(bookDir, `${label}.pdf`), config), startPage: options.startPage ?? config.start_page, endPage: options.endPage ?? config.end_page })
  if (admission.outcome !== "reused") throw new ExtractionAdmissionError("EXTRACTION_INCOMPLETE")
  recoverPackagePublication(bookDir)
  const stages = catalogResumeStages(options.fromStage, options.toStage)
  OutputRunScope.parse(options.outputScope ?? {})
  if (!stages.includes("sectioning") && stages[0] !== "extract") prepareSectioningRun(label, options.booksDir, stages[0], stages[stages.length - 1], options.configPath)
  const storage = createBookStorage(label, options.booksDir)
  try {
    if (!stages.includes("sectioning") && stages[0] !== "extract") assertSectioningCurrent(storage, config, bookDir)
    // An empty catalog cannot prove that missing Storyboard work is current.
    if (!stages.includes("storyboard") && stages[0] !== "extract" && storage.getPages().some((page) => !storage.getLatestNodeData("web-rendering", page.pageId))) {
      throw new ExtractionAdmissionError("UNSAFE_RESUME_UNAVAILABLE")
    }
    const read = () => {
      const currentConfig = loadBookConfig(label, options.booksDir, options.configPath)
      // Match the existing explicit Easy Read stage's effective configuration.
      if (options.fromStage === "easy-read" && options.toStage === "easy-read") {
        currentConfig.easy_read = { ...currentConfig.easy_read, enabled: true }
      }
      return [...(stages.some((stage) => stage === "extract" || isGenerationKind(stage)) ? readGenerationCatalog({ storage, config: currentConfig, bookDir, promptsDir: options.promptsDir, promptOverridesDir: options.promptOverridesDir, templatesDir: options.templatesDir, configPath: options.configPath, webAssetsDir: options.webAssetsDir, configDir: options.configDir ?? (options.configPath ? path.join(path.dirname(options.configPath), "config") : path.resolve("config")) }) : []), ...readOutputCatalog({ storage, bookDir, config: currentConfig, promptsDir: options.promptsDir, promptOverridesDir: options.promptOverridesDir,
        configDir: options.configDir ?? (options.configPath ? path.join(path.dirname(options.configPath), "config") : path.resolve("config")) })]
        .filter((status) => stages.includes(STEP_TO_STAGE[OUTPUT_KIND_STEP[status.identity.kind]]) && selectedOutput(status, options.outputScope?.selection))
    }
    const before = new Map(read().map((status) => [outputIdentityKey(status.identity), status]))
    for (const identity of options.outputScope?.selection?.identities ?? []) {
      if (!before.has(outputIdentityKey(identity))) throw new Error("Requested output is unavailable in this resume scope")
    }
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
      return { kind: "catalog-resume", pageErrors: storage.getPageRecovery(), extraction: options.extractionCreated ? "created" : "verified-reusable", stages,
        status: status === "complete" && outputs.some((output) => output.state === "blocked" || (output.reason === "user-skipped" && !output.current)) ? "incomplete" : status, outputs }
    }
    try {
      for (const stage of stages) {
        options.signal?.throwIfAborted()
        const outputs = read().filter((output) => STEP_TO_STAGE[OUTPUT_KIND_STEP[output.identity.kind]] === stage)
        if (stage === "package" && read().some((output) => output.identity.kind !== "package" && !output.current && !output.excluded)) continue
        if (stage === "package" || outputs.some((output) => selectedForGeneration(output, undefined, options.outputScope))) await execute(stage)
        else if (outputs.every((output) => output.current || output.excluded)) {
          reconcileCurrentGeneration(label, options, stage)
          progress.emit({ type: "stage-complete", stage })
        }
      }
    } catch (error) {
      if (options.signal?.aborted) storage.clearRunningStepRuns()
      options.onResumeSummary?.(report(options.signal?.aborted ? "cancelled" : "failed"))
      throw error
    }
    const summary = report("complete")
    options.onResumeSummary?.(summary)
    if (summary.status !== "complete") throw new ResumeIncompleteError(summary)
  } finally { storage.close() }
}
