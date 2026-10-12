import type { ResolvedCredentials } from "@adt/llm"
import type { OutputRunScope, ProgressEvent, PageErrorPolicy, StepName, PageErrorAction } from "@adt/types"

export interface StageRunOptions {
  /** Verify extraction and plan supported catalog outputs before executing. */
  resume?: boolean
  /** Internal admitted generation publication; never accepted from HTTP. */
  extractionCreated?: boolean
  replacementRange?: { fromStage: string; toStage: string }
  generationStorage?: import("@adt/storage").Storage
  generationPageIds?: string[]
  generationReplaceProtected?: boolean
  cacheDir?: string
  logLevel?: import("@adt/llm").LogLevel
  templatesDir?: string
  configDir?: string
  pdfPath?: string
  startPage?: number
  endPage?: number
  concurrency?: number
  onResumeSummary?: (summary: import("@adt/types").PipelineResumeSummary) => void
  replaceManual?: boolean
  protectedReplacements?: import("@adt/types").AuthoredReplacement[]
  outputScope?: OutputRunScope
  booksDir: string
  /** Request-scoped provider credentials. Values are never persisted. */
  credentials: ResolvedCredentials
  promptsDir: string
  webAssetsDir?: string
  configPath?: string
  fromStage: string
  toStage: string
  /** When true, skip page-sectioning and only re-render from existing section data. */
  renderOnly?: boolean
  beforeRun?: () => void
  /** Cancellation signal for the run. Aborts in-flight LLM calls and stops the
   *  runner at the next checkpoint. Set by the service per job. */
  signal?: AbortSignal
  /** How to react when a page fails inside a per-page step. Defaults to "stop"
   *  (accumulate + fail at the end — the historical behavior). */
  pageErrorPolicy?: PageErrorPolicy
  /** Ask the user how to handle a failed page (only used when pageErrorPolicy
   *  is "ask"). Bound to this run's label by the service. */
  requestPageDecision?: (input: {
    step: StepName
    pageId: string
    error: string
  }) => Promise<PageErrorAction>
}

export interface StageRunProgress {
  emit(event: ProgressEvent): void
}

export interface StageRunner {
  run(
    label: string,
    options: StageRunOptions,
    progress: StageRunProgress
  ): Promise<void>
}

