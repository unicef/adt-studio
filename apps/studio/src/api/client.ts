import { isElectron } from "@/lib/utils"
import type {
  AccessibilityAssessmentOutput,
  BookDetail,
  BookFont,
  BookFontRole,
  BookMetadata,
  BookSummary,
  BookTypography,
  FontAssignmentOutput,
  ExtractionWarning,
  ReviewerPageValidationRecord,
  ReviewerValidationIdentificationField,
  ReviewerValidationInstruction,
  ReviewerValidationSection,
  ReviewerValidationSession,
  TranslationEvaluationResult,
} from "@adt/types"
import type { ExportFormat } from "@/components/pipeline/stages/export/export-formats"

export type { BookSummary, BookDetail }

export function resolveBaseUrl(
  _loc: Pick<Location, "protocol" | "hostname"> = window.location,
): string {
  if (isElectron() && typeof window.api?.apiPort === "number") {
    const apiPort = window.api.apiPort
    return `http://localhost:${apiPort}/api`
  }

  return "/api"
}

// Guard for test/SSR environments where window is not defined
export const BASE_URL =
  typeof window !== "undefined" ? resolveBaseUrl() : "/api"

export function getAdtUrl(label: string): string {
  return `${BASE_URL}/books/${label}/adt`
}

export function getAudioUrl(
  label: string,
  language: string,
  fileName: string,
  cacheKey?: string,
): string {
  const base = `${BASE_URL}/books/${label}/audio/${language}/${fileName}`
  if (!cacheKey) return base
  const params = new URLSearchParams({ v: cacheKey })
  return `${base}?${params.toString()}`
}

export function getSignLanguageVideoUrl(label: string, videoId: string): string {
  return `${BASE_URL}/books/${label}/sign-language-videos/${videoId}`
}

export function getSectionScreenshotUrl(
  label: string,
  pageId: string,
  sectionIndex: number,
  options?: { viewport?: "desktop" | "tablet" | "mobile"; cacheKey?: string | number | null },
): string {
  const base = `${BASE_URL}/books/${label}/pages/${pageId}/sections/${sectionIndex}/screenshot`
  const params = new URLSearchParams()
  if (options?.viewport) params.set("viewport", options.viewport)
  if (options?.cacheKey != null) params.set("v", String(options.cacheKey))
  const qs = params.toString()
  return qs ? `${base}?${qs}` : base
}

export function getSourcePdfUrl(label: string): string {
  return `${BASE_URL}/books/${label}/source-pdf`
}

export function getBookCoverUrl(label: string, cacheKey?: string): string {
  const base = `${BASE_URL}/books/${label}/cover`
  if (!cacheKey) return base
  const params = new URLSearchParams({ v: cacheKey })
  return `${base}?${params.toString()}`
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${BASE_URL}${path}`
  const res = await fetch(url, {
    ...options,
    headers: {
      ...(!options?.body || options.body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      ...options?.headers,
    },
  })

  if (!res.ok) {
    const text = await res.text().catch(() => "")
    let message: string | undefined
    try {
      message = (JSON.parse(text) as { error?: string }).error
    } catch {
      message = text || undefined
    }
    throw new Error(message ?? `Request failed: ${res.status}`)
  }

  return res.json()
}

export interface ImportPreview {
  label: string
  title: string | null
  authors: string[]
  publisher: string | null
  languageCode: string | null
  pageCount: number
  hasSourcePdf: boolean
  imageCount: number
  videoCount: number
  coverBase64: string | null
  stages: Record<string, { status: string; stepCount: number; doneCount: number }>
  validationError: string | null
}

export interface PartInfo {
  sourceLabel: string
  range: { startPage: number; endPage: number }
}

export interface PageRange {
  startPage: number
  endPage: number
}

export interface SplitStatus {
  pageCount: number
  exported: PageRange[]
  exportGaps: PageRange[]
  nextGap: PageRange | null
  fullySplit: boolean
  mergedRanges: PageRange[]
  missingRanges: PageRange[]
  fullyMerged: boolean
  hasMergeActivity: boolean
}

/** Preview shape returned by the import endpoints for a lightweight part
 *  archive (PDF + window + manifest, no DB). Discriminated by `isPart`. */
export interface PartImportPreview {
  isPart: true
  label: string
  sourceLabel: string
  title: string | null
  range: { startPage: number; endPage: number }
  pageCount: number
  coverBase64: string | null
}

export type AnyImportPreview = ImportPreview | PartImportPreview

export function isPartImportPreview(
  preview: AnyImportPreview,
): preview is PartImportPreview {
  return (preview as PartImportPreview).isPart === true
}

export interface MergePreview {
  targetLabel: string
  sourceLabel: string
  title: string | null
  range: { startPage: number; endPage: number }
  identityMatch: boolean
  semanticsMatch: boolean
  semanticsDiff: string[]
  blocked: boolean
  blockReason: string | null
  warnings: string[]
  addedPageNumbers: number[]
  replacedPageNumbers: number[]
  coverage: Array<{ node: string; pages: number }>
}

export interface MergeResult {
  targetLabel: string
  addedPages: number
  replacedPages: number
  staleSteps: string[]
  bookSummaryStale: boolean
  semanticsOverridden: boolean
  metadataMerged: boolean
}

export interface AzureCredentials {
  key: string
  region: string
}

export interface StageRunProviderCredentials {
  anthropicApiKey?: string
  googleApiKey?: string
  customBaseUrl?: string
  customApiKey?: string
  azure?: AzureCredentials
  geminiApiKey?: string
}

export interface RunStagesOptions {
  fromStage: string
  toStage: string
  /** When true, skip page-sectioning and only re-render from existing section data. */
  renderOnly?: boolean
  /** How to react when a page fails inside a per-page step. The Studio sends
   *  "ask" so page errors surface an interactive skip/stop dialog. */
  pageErrorPolicy?: "ask" | "stop"
}

function buildApiHeaders(
  apiKey: string,
  providerCredentials?: StageRunProviderCredentials
): Record<string, string> {
  const headers: Record<string, string> = { "X-OpenAI-Key": apiKey }
  if (providerCredentials?.anthropicApiKey) {
    headers["X-Anthropic-API-Key"] = providerCredentials.anthropicApiKey
  }
  if (providerCredentials?.googleApiKey) {
    headers["X-Google-API-Key"] = providerCredentials.googleApiKey
  }
  if (providerCredentials?.customBaseUrl) {
    headers["X-Custom-Base-URL"] = providerCredentials.customBaseUrl
  }
  if (providerCredentials?.customApiKey) {
    headers["X-Custom-API-Key"] = providerCredentials.customApiKey
  }
  if (providerCredentials?.azure?.key) {
    headers["X-Azure-Speech-Key"] = providerCredentials.azure.key
  }
  if (providerCredentials?.azure?.region) {
    headers["X-Azure-Speech-Region"] = providerCredentials.azure.region
  }
  if (providerCredentials?.geminiApiKey) {
    headers["X-Gemini-API-Key"] = providerCredentials.geminiApiKey
  }
  return headers
}

export interface PendingDecision {
  decisionId: string
  step: string
  pageId: string
  error: string
}

export interface StageRunStatus {
  label: string
  status: "idle" | "running" | "cancelling" | "cancelled" | "completed" | "failed"
  fromStage?: string
  toStage?: string
  error?: string
  startedAt?: number
  completedAt?: number
  queue?: Array<{ id: string; fromStage: string; toStage: string }>
}

export interface PageSummarySection {
  sectionId: string
  sectionIndex: number
  sectionType: string
  isActivity: boolean
  isPruned: boolean
  textPreview: string
}

export interface PageSummaryItem {
  pageId: string
  pageNumber: number
  hasRendering: boolean
  hasCaptioning: boolean
  textPreview: string
  imageCount: number
  wordCount: number
  sectionCount: number
  prunedSections: number[]
  renderingVersion: number | null
  sectioningVersion: number | null
  sections: PageSummarySection[]
  /** `text-layer-missing` when the page's embedded text layer was empty but the
   *  Sectioning step (vision) recovered text from the page image (a scanned /
   *  image-only page); null otherwise. */
  extractionWarning: ExtractionWarning | null
}

export interface SectionRendering {
  sectionIndex: number
  sectionType: string
  reasoning: string
  html: string
  activityReasoning?: string
  activityAnswers?: Record<string, string | boolean | number>
}

export interface ContentNode {
  nodeId: string
  isPruned: boolean
  structure?: string
  children?: ContentNode[]
  role?: string
  text?: string
}

export interface AiEditHistoryTurn {
  correlationId: string
  timestamp: string
  instruction: string
  attempts: Array<{ reasoning: string; timestamp: string; cached: boolean }>
  verify?: { applied: boolean; reason: string }
}

export interface PageDetail {
  pageId: string
  pageNumber: number
  text: string
  imageClassification: {
    images: Array<{
      imageId: string
      isPruned: boolean
      reason?: string
    }>
  } | null
  imageCropping: {
    crops: Array<{
      imageId: string
      reasoning: string
      shouldCrop: boolean
      cropLeft?: number
      cropTop?: number
      cropRight?: number
      cropBottom?: number
    }>
  } | null
  sectioningTree: {
    reasoning: string
    sections: Array<{
      sectionId: string
      sectionType: string
      nodes: ContentNode[]
      backgroundColor: string
      textColor: string
      pageNumber: number | null
      isPruned: boolean
    }>
  } | null
  rendering: {
    sections: SectionRendering[]
  } | null
  imageCaptioning: {
    captions: Array<{ imageId: string; reasoning: string; caption: string; decorative?: boolean; source?: "ai" | "manual" }>
  } | null
  /** Per-image metadata (dimensions + optional PDF-point placement bounds). */
  imagesMeta: Array<{
    imageId: string
    width: number
    height: number
    bounds?: { x: number; y: number; width: number; height: number }
  }>
  /** Distinct fonts the extractor found on this page (positioned text only),
   *  each with the rounded px sizes it appears at. */
  fonts: Array<{ family: string; sizes: number[] }>
  /** Book-level detected serif/sans category (drives the reflowable base font). */
  fontProfile: { category: "serif" | "sans" | null; serifChars: number; sansChars: number } | null
  /** Resolved reflowable base-font CSS chain (gated; null for fixed-layout or
   *  the Merriweather default). The storyboard preview injects it to match the
   *  packaged output. */
  reflowableFontFamily: string | null
  /** `text-layer-missing` when the page's embedded text layer was empty but the
   *  Sectioning step (vision) recovered text from the page image (a scanned /
   *  image-only page); null otherwise. */
  extractionWarning: ExtractionWarning | null
  versions: {
    imageClassification: number | null
    imageCropping: number | null
    sectioning: number | null
    rendering: number | null
    imageCaptioning: number | null
  }
}

// --- Glossary types ---

export interface GlossaryItem {
  id?: string
  source?: "ai" | "manual"
  word: string
  definition: string
  variations: string[]
  emojis: string[]
  pruned?: boolean
  /** Optional image from the book's images table illustrating the term. */
  imageId?: string
}

export interface GlossaryOutput {
  items: GlossaryItem[]
  pageCount: number
  generatedAt: string
  version: number
}

// --- TOC types ---

export interface TocEntry {
  id: string
  title: string
  sectionId: string
  href: string
  chapterId: string
  level: number
}

export interface TocGenerationOutput {
  entries: TocEntry[]
  pageCount: number
  generatedAt: string
  version: number
}

export interface TocSection {
  sectionId: string
  href: string
  title: string
  pageNumber: number
}

// --- Quiz types ---

export interface QuizOption {
  text: string
  explanation: string
}

export interface QuizItem {
  quizIndex: number
  afterPageId: string
  pageIds: string[]
  question: string
  options: QuizOption[]
  answerIndex: number
  reasoning: string
}

export interface QuizGenerationOutput {
  generatedAt: string
  language: string
  pagesPerQuiz: number
  quizzes: QuizItem[]
}

export interface QuizzesResponse {
  quizzes: QuizGenerationOutput | null
  version: number | null
}

// --- Text Catalog types ---

export interface TextCatalogEntry {
  id: string
  text: string
}

export interface TextCatalogResponse {
  entries: TextCatalogEntry[]
  generatedAt: string
  version: number
  translations: Record<string, { entries: TextCatalogEntry[]; version: number }>
}

export interface TranslationEvaluationStatusResponse {
  language: string
  currentSourceCatalogVersion: number | null
  currentTranslationVersion: number | null
  evaluationVersion: number | null
  evaluation: TranslationEvaluationResult | null
  isStale: boolean
}

export interface TranslationEvaluationStatusesResponse {
  evaluations: TranslationEvaluationStatusResponse[]
}

export interface TranslationEvaluationRunResponse {
  status: "submitted" | "current"
  taskId: string | null
  label: string
  language: string
  version?: number | null
}

export interface EasyReadEntry {
  sourceId: string
  easyReadId: string
  originalText: string
  text: string
  pageId: string
  sectionId: string
  sectionIndex: number
}

export interface EasyReadSectionBlock {
  pageId: string
  pageNumber: number
  sectionId: string
  sectionIndex: number
  sectionType: string
  entries: EasyReadEntry[]
}

export interface EasyReadResponse {
  blocks: EasyReadSectionBlock[]
  generatedAt: string
  version: number
}

// --- TTS types ---

export interface TTSEntry {
  textId: string
  language?: string
  fileName: string
  voice: string
  model: string
  cached: boolean
  provider?: string
  cacheKey?: string
}

export interface TTSFailedEntry {
  textId: string
  error: string
}

export interface TTSLanguageData {
  entries: TTSEntry[]
  /** Items whose generation failed in the run that produced this data */
  failed?: TTSFailedEntry[]
  generatedAt: string
  version: number
}

export interface TTSResponse {
  languages: Record<string, TTSLanguageData>
  /** True when served from an in-flight speech run's live snapshot */
  live?: boolean
}

export interface GenerateSingleTTSResponse {
  entry: TTSEntry
  version: number
  completed: boolean
  remainingItems: number
}

// --- Word timestamp types ---

export interface WordTimestamp {
  word: string
  start: number
  end: number
}

export interface WordTimestampEntry {
  textId: string
  language: string
  words: WordTimestamp[]
  duration: number
}

export interface WordTimestampResponse {
  entries: Record<string, WordTimestampEntry>
  generatedAt: string | null
  /** Per-item word-timestamp failures from the last run, so the Speech view can
   * mark them for pruning or one-by-one regeneration. */
  failed?: { textId: string; error: string }[]
}

// --- Debug types ---

export interface LlmLogEntry {
  id: number
  timestamp: string
  step: string
  itemId: string
  data: {
    promptName: string
    requestedPromptName?: string
    modelId: string
    cacheHit: boolean
    durationMs: number
    usage?: { inputTokens: number; outputTokens: number }
    validationErrors?: string[]
    system?: string
    messages: Array<{
      role: string
      content: Array<
        | { type: "text"; text: string }
        | { type: "image"; hash: string; byteLength: number; width: number; height: number }
      >
    }>
  }
}

export interface LlmLogsResponse {
  logs: LlmLogEntry[]
  total: number
}

export interface StepStats {
  step: string
  calls: number
  cacheHits: number
  cacheMisses: number
  inputTokens: number
  outputTokens: number
  avgDurationMs: number
  errorCount: number
}

export interface PipelineStatsResponse {
  steps: StepStats[]
  totals: {
    calls: number
    cacheHits: number
    cacheMisses: number
    inputTokens: number
    outputTokens: number
    errorCount: number
  }
  pipelineRun: {
    status: string
    startedAt?: number
    completedAt?: number
    wallClockMs?: number
  } | null
}

export interface BookConfigResponse {
  config: Record<string, unknown>
}

export interface SpecializedModelDefaultsResponse {
  imageGeneration: string
  speechGeneration: string
}

export interface ActiveConfigResponse {
  merged: Record<string, unknown>
  hasBookOverride: boolean
}

export interface PromptResponse {
  name: string
  resolvedName?: string
  content: string
  source?: "book" | "global"
  modelId?: string | null
  version?: string
}

export interface PromptSummary {
  name: string
  variants: string[]
  variantSources?: Record<string, "file" | "version" | "file+version">
}

export interface PromptListResponse {
  prompts: PromptSummary[]
}

export interface PromptModelsResponse {
  models: string[]
}

export interface PromptVersionSummary {
  version: string
  createdAt: string | null
  content: string
  isCurrent: boolean
}

export interface PromptVersionsResponse {
  name: string
  resolvedName: string
  modelId: string | null
  fallbackContent: string | null
  fallbackResolvedName: string | null
  currentVersion: string | null
  versions: PromptVersionSummary[]
}

function promptModelQuery(modelId?: string | null): string {
  // eslint-disable-next-line lingui/no-unlocalized-strings -- API query string, not user-visible copy.
  return modelId ? `?model=${encodeURIComponent(modelId)}` : ""
}

export interface VersionEntry {
  version: number
  data?: unknown
}

export interface VersionListResponse {
  versions: VersionEntry[]
}

export interface AccessibilityAssessmentResponse {
  version: number | null
  assessment: AccessibilityAssessmentOutput | null
}

export interface ReviewerValidationCatalogResponse {
  enabled: boolean
  identificationFields: ReviewerValidationIdentificationField[]
  instructions: ReviewerValidationInstruction[]
  pageSections: ReviewerValidationSection[]
}

export interface ReviewerValidationSessionEntry {
  version: number
  session: ReviewerValidationSession
}

export interface ReviewerValidationSessionsResponse {
  sessions: ReviewerValidationSessionEntry[]
}

export interface ReviewerPageValidationRecordEntry {
  version: number
  record: ReviewerPageValidationRecord
}

export interface ReviewerPageValidationRecordsResponse {
  records: ReviewerPageValidationRecordEntry[]
}

export interface LlmLogsParams {
  step?: string
  itemId?: string
  limit?: number
  offset?: number
}

// --- Sign Language Video types ---

export interface SignLanguageVideo {
  videoId: string
  sectionId: string | null
  originalName: string
  mimeType: string
  sizeBytes: number
  createdAt: string
}

export type BookFontWithStatus = BookFont & { cached: boolean }

export interface GoogleCatalogFamily {
  family: string
  category?: string
  variants?: number
  variable?: boolean
  popularity?: number
  dateAdded?: string
}

export interface BookCurrentFont {
  detectedCategory: "serif" | "sans" | null
  setting: string
  fixedLayout: boolean
  bodyRole: boolean
  font: { id: string; family: string; category: string; google: boolean }
}

export interface BookFontsResponse {
  version: number
  fonts: BookFontWithStatus[]
  assignment: FontAssignmentOutput | null
  current: BookCurrentFont
}

export type BookFontScope = "whole" | "heading" | "paragraph" | "body" | "caption"

export interface ApplyBookFontPayload {
  scope: BookFontScope
  font?: { kind: "registry" | "reflowable"; id: string }
  reset?: boolean
}

export function getBookFontFileUrl(label: string, fontId: string, file: string): string {
  return `${BASE_URL}/books/${label}/fonts/${fontId}/files/${file}`
}

// --- Task types ---

export interface TaskInfoResponse {
  taskId: string
  kind: string
  status: "queued" | "running" | "completed" | "failed"
  description: string
  pageId?: string
  url?: string
  error?: string
  result?: unknown
  startedAt?: number
  completedAt?: number
  progressMessage?: string
  progressPercent?: number
}

export const api = {
  getBooks: () => request<BookSummary[]>("/books"),

  getBook: (label: string) => request<BookDetail>(`/books/${label}`),

  updateMetadata: (label: string, data: BookMetadata) =>
    request<{ version: number; languageChanged: boolean; baseLanguageChanged: boolean }>(
      `/books/${label}/metadata`,
      {
        method: "PUT",
        body: JSON.stringify(data),
      },
    ),

  regenerateBookSummary: (label: string, apiKey: string) =>
    request<{ taskId?: string; status?: string; version?: number }>(
      `/books/${label}/book-summary/regenerate`,
      {
        method: "POST",
        headers: { "X-OpenAI-Key": apiKey },
      },
    ),

  getSourcePdfInfo: (label: string) =>
    request<{ pageCount: number }>(`/books/${label}/source-pdf/info`),

  getSpreadSuggestions: (label: string) =>
    request<{ suggestions: { lead: number; confidence: number }[] }>(
      `/books/${label}/spread-suggestions`,
    ),

  applySpreads: (label: string, spreadPairs: number[]) =>
    request<{ merged: number; removed: number; pageCount: number }>(
      `/books/${label}/spreads/apply`,
      { method: "POST", body: JSON.stringify({ spreadPairs }) },
    ),

  getBookFonts: (label: string) => request<BookFontsResponse>(`/books/${label}/fonts`),

  getTypography: (label: string) =>
    request<{ data: BookTypography; version: number; isDefault: boolean; detected: BookTypography }>(
      `/books/${label}/typography`
    ),

  updateTypography: (label: string, data: BookTypography) =>
    request<{ version: number }>(`/books/${label}/typography`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  getGoogleFontsCatalog: () =>
    request<{ families: GoogleCatalogFamily[] }>("/google-fonts/catalog"),

  uploadBookFonts: (label: string, files: File[]) => {
    const formData = new FormData()
    for (const file of files) formData.append("fonts", file)
    return request<BookFontsResponse>(`/books/${label}/fonts`, {
      method: "POST",
      body: formData,
    })
  },

  addGoogleFont: (label: string, family: string) =>
    request<BookFontsResponse>(`/books/${label}/fonts/google`, {
      method: "POST",
      body: JSON.stringify({ family }),
    }),

  updateBookFont: (
    label: string,
    fontId: string,
    data: { family?: string; role?: BookFontRole; roleLockedByUser?: boolean },
  ) =>
    request<BookFontsResponse>(`/books/${label}/fonts/${fontId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  deleteBookFont: (label: string, fontId: string) =>
    request<BookFontsResponse>(`/books/${label}/fonts/${fontId}`, { method: "DELETE" }),

  analyzeBookFonts: (label: string, apiKey: string) =>
    request<{ taskId?: string; status?: string; version?: number }>(
      `/books/${label}/fonts/analyze`,
      {
        method: "POST",
        headers: { "X-OpenAI-Key": apiKey },
      },
    ),

  applyBookFont: (label: string, payload: ApplyBookFontPayload) =>
    request<BookFontsResponse & { pagesUpdated: number }>(`/books/${label}/fonts/apply`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  createBook: (label: string, pdf: File, config?: Record<string, unknown>) => {
    const formData = new FormData()
    formData.append("label", label)
    formData.append("pdf", pdf)
    if (config) {
      formData.append("config", JSON.stringify(config))
    }
    return request<BookSummary>("/books", {
      method: "POST",
      body: formData,
    })
  },

  deleteBook: (label: string) =>
    request<{ ok: boolean }>(`/books/${label}`, { method: "DELETE" }),

  previewImport: (zip: File) => {
    const formData = new FormData()
    formData.append("zip", zip)
    return request<AnyImportPreview>("/books/preview-import", {
      method: "POST",
      body: formData,
    })
  },

  importBook: (zip: File) => {
    const formData = new FormData()
    formData.append("zip", zip)
    return request<BookSummary>("/books/import", {
      method: "POST",
      body: formData,
    })
  },

  getPartInfo: (label: string) =>
    request<PartInfo | null>(`/books/${label}/part-info`),

  getSplitStatus: (label: string) =>
    request<SplitStatus>(`/books/${label}/split-status`),

  exportPart: (label: string, startPage: number, endPage: number) => {
    triggerDirectDownload(
      `${BASE_URL}/books/${label}/export-part?startPage=${startPage}&endPage=${endPage}`,
    )
  },

  previewMerge: (label: string, zip: File) => {
    const formData = new FormData()
    formData.append("zip", zip)
    return request<MergePreview>(`/books/${label}/preview-merge`, {
      method: "POST",
      body: formData,
    })
  },

  mergePart: (label: string, zip: File, acknowledgeSemanticsMismatch: boolean) => {
    const formData = new FormData()
    formData.append("zip", zip)
    if (acknowledgeSemanticsMismatch) {
      formData.append("acknowledgeSemanticsMismatch", "true")
    }
    return request<MergeResult>(`/books/${label}/merge`, {
      method: "POST",
      body: formData,
    })
  },

  runStages: (
    label: string,
    apiKey: string,
    options: RunStagesOptions,
    providerCredentials?: StageRunProviderCredentials
  ) =>
    request<{ status: string; label: string; fromStage: string; toStage: string }>(
      `/books/${label}/stages/run`,
      {
        method: "POST",
        headers: buildApiHeaders(apiKey, providerCredentials),
        body: JSON.stringify(options),
      }
    ),

  getStagesStatus: (label: string) =>
    request<StageRunStatus>(`/books/${label}/stages/status`),

  /** Cancel the active run. Queued runs are preserved and start after it unwinds;
   *  a pending queue with no active run is cleared instead. A 404 (nothing to
   *  cancel — the run may have finished between the click and this request)
   *  resolves silently. */
  cancelRun: async (label: string): Promise<void> => {
    const res = await fetch(`${BASE_URL}/books/${label}/stages/cancel`, {
      method: "POST",
    })
    if (res.ok || res.status === 404) return
    const text = await res.text().catch(() => "")
    throw new Error(text || `Cancel failed: ${res.status}`)
  },

  /** Resolve a pending page-error decision. A 409 (already resolved by
   *  timeout/cancel) is treated as success — the caller drops the stale dialog. */
  resolveDecision: async (
    label: string,
    body: { decisionId: string; action: "skip" | "stop"; applyToAll?: boolean },
  ): Promise<void> => {
    const res = await fetch(`${BASE_URL}/books/${label}/stages/decision`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    if (res.ok || res.status === 409) return
    const text = await res.text().catch(() => "")
    throw new Error(text || `Decision failed: ${res.status}`)
  },

  getPages: (label: string) =>
    request<PageSummaryItem[]>(`/books/${label}/pages`),

  getPage: (label: string, pageId: string) =>
    request<PageDetail>(`/books/${label}/pages/${pageId}`),

  getPageImage: (label: string, pageId: string) =>
    request<{ imageBase64: string }>(`/books/${label}/pages/${pageId}/image`),

  updateImageClassification: (label: string, pageId: string, data: unknown) =>
    request<{ version: number }>(`/books/${label}/pages/${pageId}/image-filtering`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  updateSectioning: (label: string, pageId: string, data: unknown) =>
    request<{ version: number }>(`/books/${label}/pages/${pageId}/sectioning`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  updateRendering: (label: string, pageId: string, data: unknown) =>
    request<{ version: number }>(`/books/${label}/pages/${pageId}/rendering`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  updateImageCaptioning: (label: string, pageId: string, data: unknown) =>
    request<{ version: number }>(`/books/${label}/pages/${pageId}/image-captioning`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  cloneSection: (label: string, pageId: string, sectionIndex: number) =>
    request<{
      clonedSectionIndex: number
      sectioningVersion: number
      renderingVersion: number | null
    }>(`/books/${label}/pages/${pageId}/sections/${sectionIndex}/clone`, {
      method: "POST",
    }),

  splitSection: (
    label: string,
    pageId: string,
    sectionIndex: number,
    at: { beforeNodeIndex: number } | { beforeNodeId: string }
  ) =>
    request<{
      splitSectionIndex: number
      sectioningVersion: number
      renderingVersion: number | null
    }>(`/books/${label}/pages/${pageId}/sections/${sectionIndex}/split`, {
      method: "POST",
      body: JSON.stringify(at),
    }),

  mergeSection: (
    label: string,
    pageId: string,
    sectionIndex: number,
    direction: "next" | "prev" = "next"
  ) =>
    request<{
      mergedSectionIndex: number
      sectioningVersion: number
      renderingVersion: number | null
    }>(
      `/books/${label}/pages/${pageId}/sections/${sectionIndex}/merge?direction=${direction}`,
      { method: "POST" }
    ),

  mergeSectionCrossPage: (
    label: string,
    pageId: string,
    sectionIndex: number,
    direction: "next" | "prev"
  ) =>
    request<{
      sourcePageId: string
      targetPageId: string
      targetSectionIndex: number
      sourceSectioningVersion: number
      targetSectioningVersion: number
      sourceRenderingVersion: number | null
      targetRenderingVersion: number | null
    }>(
      `/books/${label}/pages/${pageId}/sections/${sectionIndex}/merge-cross-page?direction=${direction}`,
      { method: "POST" }
    ),

  deleteSection: (label: string, pageId: string, sectionIndex: number) =>
    request<{
      sectioningVersion: number
      renderingVersion: number | null
      remainingSections: number
    }>(`/books/${label}/pages/${pageId}/sections/${sectionIndex}`, {
      method: "DELETE",
    }),

  reRenderPage: (label: string, pageId: string, apiKey: string, sectionIndex?: number, prompt?: string) =>
    request<{ taskId?: string; status?: string; version?: number; rendering?: { sections: SectionRendering[] } }>(
      `/books/${label}/pages/${pageId}/re-render${sectionIndex !== undefined ? `?sectionIndex=${sectionIndex}` : ""}`,
      {
        method: "POST",
        headers: { "X-OpenAI-Key": apiKey },
        ...(prompt ? { body: JSON.stringify({ prompt }) } : {}),
        signal: AbortSignal.timeout(30_000), // Just submitting a task now
      }
    ),

  aiEditSection: (
    label: string,
    pageId: string,
    sectionIndex: number,
    instruction: string,
    apiKey: string,
    currentHtml?: string,
  ) =>
    request<{ taskId?: string; status?: string; html?: string; reasoning?: string }>(
      `/books/${label}/pages/${pageId}/sections/${sectionIndex}/ai-edit`,
      {
        method: "POST",
        headers: { "X-OpenAI-Key": apiKey },
        body: JSON.stringify({ instruction, currentHtml }),
        signal: AbortSignal.timeout(30_000),
      }
    ),

  aiEditHistory: (label: string, pageId: string, sectionIndex: number) =>
    request<{ history: AiEditHistoryTurn[] }>(
      `/books/${label}/pages/${pageId}/sections/${sectionIndex}/ai-edit-history`,
    ),

  listBookImages: (label: string) =>
    request<{
      images: Array<{
        imageId: string
        pageId: string
        width: number
        height: number
        source: string
      }>
    }>(`/books/${label}/images`),

  listCaptionedImages: (label: string) =>
    request<{
      images: Array<{
        imageId: string
        pageId: string
        width: number
        height: number
        source: string
        caption: string
      }>
    }>(`/books/${label}/captioned-images`),

  listTranslatedImages: (label: string) =>
    request<{
      images: Array<{
        imageId: string
        sourceImageId: string
        language: string
        pageId: string
        width: number
        height: number
      }>
    }>(`/books/${label}/translated-images`),

  uploadNewImage: (label: string, pageId: string, imageBlob: Blob) => {
    const formData = new FormData()
    formData.append("image", imageBlob, "upload.png")
    formData.append("pageId", pageId)
    return request<{ imageId: string; width: number; height: number }>(
      `/books/${label}/images/upload`,
      { method: "POST", body: formData }
    )
  },

  uploadCroppedImage: (label: string, pageId: string, sourceImageId: string, imageBlob: Blob) => {
    const formData = new FormData()
    formData.append("image", imageBlob, "crop.png")
    formData.append("pageId", pageId)
    formData.append("sourceImageId", sourceImageId)
    return request<{ imageId: string; width: number; height: number }>(
      `/books/${label}/images`,
      { method: "POST", body: formData }
    )
  },

  aiGenerateImage: (
    label: string,
    pageId: string,
    prompt: string,
    apiKey: string,
    targetImageId: string,
    referenceImageId?: string,
    signal?: AbortSignal,
    options?: { style?: string; imageType?: string; styleImageId?: string; sectionIndex?: number; mode?: "swap" | "add" },
  ) =>
    request<{ taskId: string; status: string }>(
      `/books/${label}/images/ai-generate?pageId=${pageId}`,
      {
        method: "POST",
        headers: { "X-OpenAI-Key": apiKey },
        body: JSON.stringify({
          prompt,
          targetImageId,
          referenceImageId,
          ...(options?.style && { style: options.style }),
          ...(options?.imageType && { imageType: options.imageType }),
          ...(options?.styleImageId && { styleImageId: options.styleImageId }),
          ...(options?.sectionIndex !== undefined && { sectionIndex: options.sectionIndex }),
          ...(options?.mode && { mode: options.mode }),
        }),
        signal: signal ?? AbortSignal.timeout(30_000), // Just submitting — no need for 180s
      }
    ),

  segmentImage: (label: string, imageId: string, pageId: string, apiKey: string, signal?: AbortSignal) =>
    request<{
      segmented: boolean
      imageWidth?: number
      imageHeight?: number
      regions?: Array<{ label: string; cropLeft: number; cropTop: number; cropRight: number; cropBottom: number }>
    }>(
      `/books/${label}/images/${imageId}/segment?pageId=${pageId}`,
      {
        method: "POST",
        headers: { "X-OpenAI-Key": apiKey },
        signal: signal ?? AbortSignal.timeout(120_000),
      }
    ),

  applySegmentation: (
    label: string,
    imageId: string,
    pageId: string,
    regions: Array<{ label: string; cropLeft: number; cropTop: number; cropRight: number; cropBottom: number }>,
    signal?: AbortSignal
  ) =>
    request<{ segments: Array<{ imageId: string; label: string; width: number; height: number }> }>(
      `/books/${label}/images/${imageId}/segment/apply?pageId=${pageId}`,
      {
        method: "POST",
        body: JSON.stringify({ regions }),
        signal: signal ?? AbortSignal.timeout(120_000),
      }
    ),

  // --- Debug endpoints ---

  getLlmLogs: (label: string, params?: LlmLogsParams) => {
    const qs = new URLSearchParams()
    if (params?.step) qs.set("step", params.step)
    if (params?.itemId) qs.set("itemId", params.itemId)
    if (params?.limit != null) qs.set("limit", String(params.limit))
    if (params?.offset != null) qs.set("offset", String(params.offset))
    const query = qs.toString()
    return request<LlmLogsResponse>(
      `/books/${label}/debug/llm-logs${query ? `?${query}` : ""}`
    )
  },

  getPipelineStats: (label: string) =>
    request<PipelineStatsResponse>(`/books/${label}/debug/stats`),

  getActiveConfig: (label: string) =>
    request<ActiveConfigResponse>(`/books/${label}/debug/config`),

  getAccessibilityAssessment: (label: string) =>
    request<AccessibilityAssessmentResponse>(`/books/${label}/debug/accessibility`),

  getReviewerValidationCatalog: (label: string) =>
    request<ReviewerValidationCatalogResponse>(`/books/${label}/validation/catalog`),

  getReviewerValidationSessions: (label: string) =>
    request<ReviewerValidationSessionsResponse>(`/books/${label}/validation/sessions`),

  saveReviewerValidationSession: (label: string, session: ReviewerValidationSession) =>
    request<ReviewerValidationSessionEntry>(`/books/${label}/validation/sessions`, {
      method: "POST",
      body: JSON.stringify(session),
    }),

  getReviewerPageValidationRecords: (
    label: string,
    params: { sessionId: string; pageId?: string; language?: string },
  ) => {
    const qs = new URLSearchParams()
    qs.set("sessionId", params.sessionId)
    if (params.pageId) qs.set("pageId", params.pageId)
    if (params.language) qs.set("language", params.language)
    return request<ReviewerPageValidationRecordsResponse>(
      `/books/${label}/validation/page-results?${qs.toString()}`,
    )
  },

  saveReviewerPageValidationRecord: (label: string, record: ReviewerPageValidationRecord) =>
    request<ReviewerPageValidationRecordEntry>(`/books/${label}/validation/page-results`, {
      method: "POST",
      body: JSON.stringify(record),
    }),

  getVersionHistory: (
    label: string,
    node: string,
    itemId: string,
    includeData?: boolean
  ) =>
    request<VersionListResponse>(
      `/books/${label}/debug/versions/${node}/${itemId}${includeData ? "?includeData=true" : ""}`
    ),

  getBookConfig: (label: string) =>
    request<BookConfigResponse>(`/books/${label}/config`),

  updateBookConfig: (label: string, config: Record<string, unknown>) =>
    request<BookConfigResponse>(`/books/${label}/config`, {
      method: "PUT",
      body: JSON.stringify({ config }),
    }),

  listPrompts: () => request<PromptListResponse>("/prompts"),

  listPromptModels: () => request<PromptModelsResponse>("/prompt-models"),

  updatePromptModels: (models: string[]) =>
    request<PromptModelsResponse>("/prompt-models", {
      method: "PUT",
      body: JSON.stringify({ models }),
    }),

  getPrompt: (name: string, bookLabel?: string, modelId?: string | null) => {
    const query = promptModelQuery(modelId)
    return request<PromptResponse>(
      bookLabel ? `/books/${bookLabel}/prompts/${name}${query}` : `/prompts/${name}${query}`
    )
  },

  updatePrompt: (name: string, content: string, bookLabel?: string, modelId?: string | null) => {
    const query = promptModelQuery(modelId)
    return request<PromptResponse>(
      bookLabel ? `/books/${bookLabel}/prompts/${name}${query}` : `/prompts/${name}${query}`,
      { method: "PUT", body: JSON.stringify({ content }) },
    )
  },

  listPromptVersions: (name: string, modelId?: string | null, bookLabel?: string) => {
    const query = promptModelQuery(modelId)
    return request<PromptVersionsResponse>(
      bookLabel ? `/books/${bookLabel}/prompts/${name}/versions${query}` : `/prompts/${name}/versions${query}`,
    )
  },

  setPromptVersionCurrent: (
    name: string,
    version: string,
    modelId?: string | null,
    bookLabel?: string,
  ) => {
    const query = promptModelQuery(modelId)
    return request<PromptResponse>(
      bookLabel
        ? `/books/${bookLabel}/prompts/${name}/versions/${encodeURIComponent(version)}/current${query}`
        : `/prompts/${name}/versions/${encodeURIComponent(version)}/current${query}`,
      { method: "PUT" },
    )
  },

  resetPrompt: (name: string, modelId?: string | null, bookLabel?: string) => {
    const query = promptModelQuery(modelId)
    return request<PromptResponse>(
      bookLabel ? `/books/${bookLabel}/prompts/${name}${query}` : `/prompts/${name}${query}`,
      { method: "DELETE" },
    )
  },

  getTemplate: (name: string, bookLabel?: string) =>
    request<{ name: string; content: string; source?: string }>(
      bookLabel ? `/books/${bookLabel}/templates/${name}` : `/templates/${name}`
    ),

  updateTemplate: (name: string, content: string, bookLabel?: string) =>
    request<{ name: string; content: string; source?: string }>(
      bookLabel ? `/books/${bookLabel}/templates/${name}` : `/templates/${name}`,
      { method: "PUT", body: JSON.stringify({ content }) },
    ),

  getQuizzes: (label: string) =>
    request<QuizzesResponse>(`/books/${label}/quizzes`),

  updateQuizzes: (label: string, data: unknown) =>
    request<{ version: number }>(`/books/${label}/quizzes`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  generateQuiz: (
    label: string,
    apiKey: string,
    body: {
      pageIds: string[]
      afterPageId: string
      placement?: "replace" | "after"
    },
    providerCredentials?: StageRunProviderCredentials
  ) =>
    request<{ quiz: QuizItem; version: number }>(
      `/books/${label}/quizzes/generate-one`,
      {
        method: "POST",
        headers: buildApiHeaders(apiKey, providerCredentials),
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(120_000),
      }
    ),

  getGlossary: (label: string) =>
    request<GlossaryOutput | null>(`/books/${label}/glossary`),

  updateGlossary: (label: string, data: unknown) =>
    request<{ version: number; imageRequirementsChanged: boolean }>(
      `/books/${label}/glossary`,
      {
        method: "PUT",
        body: JSON.stringify(data),
      },
    ),

  generateGlossaryItem: (
    label: string,
    apiKey: string,
    body: { word: string; context?: string; candidateVariations?: string[] }
  ) =>
    request<{ definition: string; variations: string[]; emojis: string[] }>(
      `/books/${label}/glossary/generate-one`,
      {
        method: "POST",
        headers: { "X-OpenAI-Key": apiKey },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(60_000),
      }
    ),

  getToc: (label: string) =>
    request<TocGenerationOutput | null>(`/books/${label}/toc`),

  updateToc: (label: string, data: unknown) =>
    request<{ version: number }>(`/books/${label}/toc`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  getTocSections: (label: string) =>
    request<TocSection[]>(`/books/${label}/toc/sections`),

  getTextCatalog: (label: string) =>
    request<TextCatalogResponse | null>(`/books/${label}/text-catalog`),

  getEasyRead: (label: string) =>
    request<EasyReadResponse | null>(`/books/${label}/easy-read`),

  updateEasyRead: (label: string, data: { blocks: EasyReadSectionBlock[]; generatedAt: string }) =>
    request<{ version: number }>(`/books/${label}/easy-read`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  regenerateEasyRead: (label: string, apiKey: string) =>
    request<EasyReadResponse>(`/books/${label}/easy-read/regenerate`, {
      method: "POST",
      headers: { "X-OpenAI-Key": apiKey },
    }),

  updateTranslation: (label: string, language: string, data: unknown) =>
    request<{ version: number }>(`/books/${label}/text-catalog-translation/${language}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  getTranslationEvaluations: (label: string) =>
    request<TranslationEvaluationStatusesResponse>(`/books/${label}/evaluations/translations`),

  getTranslationEvaluation: (label: string, language: string) =>
    request<TranslationEvaluationStatusResponse>(`/books/${label}/evaluations/translations/${language}`),

  // The judge model is configurable, so send every provider credential the user
  // has — the server picks the one matching the configured model.
  runTranslationEvaluation: (
    label: string,
    language: string,
    apiKey: string,
    scope: { pageId?: string; entryIds?: string[] } = {},
    providerCredentials?: StageRunProviderCredentials,
  ) =>
    request<TranslationEvaluationRunResponse>(`/books/${label}/evaluations/translations/${language}/run`, {
      method: "POST",
      headers: buildApiHeaders(apiKey, providerCredentials),
      body: JSON.stringify({
        ...(scope.pageId ? { page_id: scope.pageId } : {}),
        ...(scope.entryIds && scope.entryIds.length > 0 ? { entry_ids: scope.entryIds } : {}),
      }),
    }),

  acceptTranslationEvaluationItemAnyway: (label: string, language: string, entryId: string) =>
    request<{ version: number; evaluation: TranslationEvaluationResult }>(
      `/books/${label}/evaluations/translations/${language}/items/${encodeURIComponent(entryId)}/accept-anyway`,
      { method: "POST" },
    ),

  getStepStatus: (label: string) =>
    request<{
      stages: Record<string, string>
      steps: Record<string, string>
      error: string | null
      stepErrors: Record<string, string> | null
      stepMessages: Record<string, string> | null
      runStatus: "idle" | "running" | "cancelling" | "cancelled" | "completed" | "failed"
      pendingDecisions: PendingDecision[]
    }>(`/books/${label}/step-status`),

  getTTS: (label: string) =>
    request<TTSResponse>(`/books/${label}/tts`),

  deleteTTS: (label: string) =>
    request<{ ok: boolean }>(`/books/${label}/tts`, { method: "DELETE" }),

  generateGeminiTTSForItem: (
    label: string,
    textId: string,
    language: string,
    credentials: {
      geminiApiKey: string
      openaiApiKey?: string
      azure?: AzureCredentials
    }
  ) =>
    request<GenerateSingleTTSResponse>(`/books/${label}/tts/generate-one`, {
      method: "POST",
      headers: {
        "X-Gemini-API-Key": credentials.geminiApiKey,
        ...(credentials.openaiApiKey ? { "X-OpenAI-Key": credentials.openaiApiKey } : {}),
        ...(credentials.azure?.key ? { "X-Azure-Speech-Key": credentials.azure.key } : {}),
        ...(credentials.azure?.region ? { "X-Azure-Speech-Region": credentials.azure.region } : {}),
      },
      body: JSON.stringify({ textId, language }),
    }),

  uploadTTSForItem: (
    label: string,
    textId: string,
    language: string,
    file: File,
  ) => {
    const formData = new FormData()
    formData.append("audio", file)
    formData.append("textId", textId)
    formData.append("language", language)
    return request<GenerateSingleTTSResponse>(`/books/${label}/tts/upload-one`, {
      method: "POST",
      body: formData,
    })
  },

  getWordTimestamps: (label: string, language: string) =>
    request<WordTimestampResponse>(`/books/${label}/tts/timestamps/${language}`),

  transcribeOne: (label: string, textId: string, language: string, openaiApiKey: string) =>
    request<{ entry: WordTimestampEntry }>(`/books/${label}/tts/transcribe-one`, {
      method: "POST",
      headers: {
        "X-OpenAI-Key": openaiApiKey,
      },
      body: JSON.stringify({ textId, language }),
    }),

  saveWordTimestamps: (label: string, language: string, textId: string, data: { words: WordTimestamp[]; duration: number }) =>
    request<{ ok: boolean }>(`/books/${label}/tts/timestamps/${language}/${textId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  transcribeAll: (label: string, language: string, openaiApiKey: string) =>
    request<{ taskId: string | null; count?: number; skipped?: number }>(`/books/${label}/tts/transcribe-all`, {
      method: "POST",
      headers: {
        "X-OpenAI-Key": openaiApiKey,
      },
      body: JSON.stringify({ language }),
    }),

  packageAdt: (label: string) =>
    request<{ status: string; label: string; taskId?: string; version?: string }>(
      `/books/${label}/package-adt`,
      { method: "POST" }
    ),

  getTasks: (label: string) =>
    request<{ tasks: TaskInfoResponse[] }>(`/books/${label}/tasks`),

  getPackageAdtStatus: (label: string) =>
    request<{ label: string; hasAdt: boolean; version?: string }>(
      `/books/${label}/package-adt/status`
    ),

  getTemplates: () =>
    request<{ templates: string[] }>(`/templates`),

  getStyleguides: () =>
    request<{ styleguides: string[] }>(`/styleguides`),

  getStyleguidePreview: (name: string) =>
    request<{ name: string; html: string }>(`/styleguides/${name}/preview`),

  uploadStyleguide: (file: File) => {
    const form = new FormData()
    form.append("file", file)
    return request<{ name: string }>(`/styleguides/upload`, {
      method: "POST",
      body: form,
    })
  },

  generateStyleguide: (label: string, pageIds: string[], apiKey: string, signal?: AbortSignal) =>
    request<{ name: string; content: string; reasoning: string }>(
      `/books/${label}/generate-styleguide`,
      {
        method: "POST",
        headers: { "X-OpenAI-Key": apiKey },
        body: JSON.stringify({ pageIds }),
        signal: signal ?? AbortSignal.timeout(180_000),
      }
    ),

  getSignLanguageVideos: (label: string) =>
    request<{ videos: SignLanguageVideo[] }>(`/books/${label}/sign-language-videos`),

  uploadSignLanguageVideo: (label: string, file: File) => {
    const formData = new FormData()
    formData.append("video", file)
    return request<{ videoId: string; originalName: string; mimeType: string; sizeBytes: number }>(
      `/books/${label}/sign-language-videos`,
      { method: "POST", body: formData }
    )
  },

  assignSignLanguageVideo: (label: string, videoId: string, sectionId: string | null) =>
    request<{ ok: boolean }>(`/books/${label}/sign-language-videos/${videoId}/assign`, {
      method: "PUT",
      body: JSON.stringify({ sectionId }),
    }),

  deleteSignLanguageVideo: (label: string, videoId: string) =>
    request<{ ok: boolean }>(`/books/${label}/sign-language-videos/${videoId}`, {
      method: "DELETE",
    }),

  getGlobalConfig: () =>
    request<{ config: Record<string, unknown> }>(`/config`),

  getDefaultModel: () =>
    request<{ model: string }>(`/config/default-model`),

  updateDefaultModel: (model: string) =>
    request<{ model: string }>(`/config/default-model`, {
      method: "PUT",
      body: JSON.stringify({ model }),
    }),

  getSpecializedModelDefaults: () =>
    request<SpecializedModelDefaultsResponse>(
      `/config/specialized-model-defaults`,
    ),

  updateSpecializedModelDefaults: (
    defaults: SpecializedModelDefaultsResponse,
  ) =>
    request<SpecializedModelDefaultsResponse>(
      `/config/specialized-model-defaults`,
      {
        method: "PUT",
        body: JSON.stringify(defaults),
      },
    ),

  getSpeechInstructions: () =>
    request<Record<string, string>>("/speech-config/instructions"),

  updateSpeechInstructions: (data: Record<string, string>) =>
    request<Record<string, string>>("/speech-config/instructions", {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  getVoiceMappings: () =>
    request<Record<string, Record<string, string>>>("/speech-config/voices"),

  updateVoiceMappings: (data: Record<string, Record<string, string>>) =>
    request<Record<string, Record<string, string>>>("/speech-config/voices", {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  prepareExport: (
    label: string,
    format: ExportFormat = "project",
    features?: { glossary?: boolean; readAloud?: boolean; quizzes?: boolean; signLanguage?: boolean; languages?: string[] },
    defaultSettings?: {
      dockLayout?: { width?: "compact" | "full"; position?: "top" | "bottom"; align?: "center" | "spread" }
      theme?: "light" | "dark" | "system"
      iconSize?: "sm" | "md" | "lg"
      reduceMotion?: boolean
    },
  ) => {
    const body: Record<string, unknown> = {}
    if (features) body.features = features
    if (defaultSettings) body.defaultSettings = defaultSettings
    return request<{ taskId?: string; status: string; label: string }>(
      `/books/${label}/prepare-export?format=${format}`,
      {
        method: "POST",
        body: Object.keys(body).length > 0 ? JSON.stringify(body) : undefined,
      }
    )
  },

  exportProject: async (label: string): Promise<Blob | null> => {
    if (!isDesktop()) {
      triggerDirectDownload(`${BASE_URL}/books/${label}/export-project`)
      return null
    }
    const url = `${BASE_URL}/books/${label}/export-project`
    const res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/zip" },
      mode: "cors",
      signal: AbortSignal.timeout(1_800_000),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText }))
      throw new Error(body.error ?? `Export failed: ${res.status}`)
    }
    const buf = await res.arrayBuffer()
    return new Blob([buf], { type: "application/zip" })
  },

  exportWebpub: async (label: string): Promise<Blob | null> => {
    if (!isDesktop()) {
      triggerDirectDownload(`${BASE_URL}/books/${label}/export-webpub`)
      return null
    }
    const url = `${BASE_URL}/books/${label}/export-webpub`
    const res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/zip" },
      mode: "cors",
      signal: AbortSignal.timeout(1_800_000),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText }))
      throw new Error(body.error ?? `WebPub export failed: ${res.status}`)
    }
    const buf = await res.arrayBuffer()
    return new Blob([buf], { type: "application/zip" })
  },

  exportEpub: async (label: string): Promise<Blob | null> => {
    if (!isDesktop()) {
      triggerDirectDownload(`${BASE_URL}/books/${label}/export-epub`)
      return null
    }
    const url = `${BASE_URL}/books/${label}/export-epub`
    const res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/epub+zip" },
      mode: "cors",
      signal: AbortSignal.timeout(300_000),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText }))
      throw new Error(body.error ?? `EPUB export failed: ${res.status}`)
    }
    const buf = await res.arrayBuffer()
    return new Blob([buf], { type: "application/epub+zip" })
  },

  exportScorm: async (label: string): Promise<Blob | null> => {
    if (!isDesktop()) {
      triggerDirectDownload(`${BASE_URL}/books/${label}/export-scorm`)
      return null
    }
    const url = `${BASE_URL}/books/${label}/export-scorm`
    const res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/zip" },
      mode: "cors",
      signal: AbortSignal.timeout(1_800_000),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText }))
      throw new Error(body.error ?? `SCORM export failed: ${res.status}`)
    }
    const buf = await res.arrayBuffer()
    return new Blob([buf], { type: "application/zip" })
  },

  exportAdt: async (label: string): Promise<Blob | null> => {
    if (!isDesktop()) {
      triggerDirectDownload(`${BASE_URL}/books/${label}/export-adt`)
      return null
    }
    const url = `${BASE_URL}/books/${label}/export-adt`
    const res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/zip" },
      mode: "cors",
      signal: AbortSignal.timeout(1_800_000),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText }))
      throw new Error(body.error ?? `ADT export failed: ${res.status}`)
    }
    const buf = await res.arrayBuffer()
    return new Blob([buf], { type: "application/zip" })
  },
}

function isDesktop(): boolean {
  return BASE_URL.startsWith("http")
}

/** Trigger a native browser download via anchor click (same-origin only). */
function triggerDirectDownload(url: string): void {
  const a = document.createElement("a")
  a.href = url
  a.download = ""
  document.body.appendChild(a)
  a.click()
  setTimeout(() => document.body.removeChild(a), 1500)
}
