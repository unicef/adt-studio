export interface ConversionEntry {
  name: string
  dbModified: number
  dbSize: number
}

export interface ConversionListing {
  folder: string
  booksDir: string
  conversions: ConversionEntry[]
}

export interface ConversionSummary {
  name: string
  pdfHash: string | null
  config: string | null
  metrics: RunMetrics
}

export interface StepRun {
  step: string
  status: string
  startedAt: number | null
  completedAt: number | null
  message: string
}

export interface LlmCall {
  id: number
  task: string
  model: string
  item: string
  attempt: number
  success: boolean
  errorCount: number
  cacheHit: boolean
  durationMs: number
  inputTokens: number
  outputTokens: number
  reasoningTokens: number | null
  cachedInputTokens: number | null
  effort: string | null
  start: number
  end: number
  validationErrors: string[]
}

export interface ConversionData {
  name: string
  pdfModified: number | null
  pdfHash: string | null
  config: string | null
  steps: StepRun[]
  calls: LlmCall[]
}

export interface StepSpan {
  step: string
  status: string
  startS: number
  endS: number
  durationS: number
  message: string
}

export interface CallSpan {
  id: number
  task: string
  model: string
  item: string
  attempt: number
  success: boolean
  errorCount: number
  startS: number
  durationS: number
  inputTokens: number
  outputTokens: number
  effort: string | null
}

export interface TaskMetrics {
  task: string
  models: string[]
  efforts: string[]
  calls: number
  failedCalls: number
  validationErrors: number
  inputTokens: number
  outputTokens: number
  sumS: number
  avgS: number
  p50S: number
  p90S: number
  maxS: number
}

export interface ModelMetrics {
  model: string
  calls: number
  inputTokens: number
  outputTokens: number
  sumS: number
}

export interface ErrorBucket {
  task: string
  type: string
  count: number
  example: string
}

export interface AttemptBucket {
  task: string
  attempt: number
  calls: number
}

export interface RunMetrics {
  name: string
  startedAt: number
  startedFromPdf: boolean
  totalS: number
  postExtractS: number
  callCount: number
  failedCalls: number
  retries: number
  validationErrors: number
  finalFailures: number
  timeouts: number
  cacheHits: number
  peakConcurrency: number
  inputTokens: number
  outputTokens: number
  reasoningTokens: number | null
  cachedInputTokens: number | null
  llmTimeS: number
  costUsd: number
  models: string[]
  efforts: string[]
  unfinishedSteps: string[]
  steps: StepSpan[]
  callSpans: CallSpan[]
  byTask: TaskMetrics[]
  byModel: ModelMetrics[]
  errors: ErrorBucket[]
  attempts: AttemptBucket[]
}
