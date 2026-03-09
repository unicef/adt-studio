export function resolveBaseUrl(
  loc: Pick<Location, "protocol" | "hostname"> = window.location,
): string {
  if (loc.protocol === "tauri:" || loc.hostname === "tauri.localhost") {
    return "http://localhost:3001/api"
  }
  return "/api"
}

// Guard for test/SSR environments where window is not defined
export const BASE_URL =
  typeof window !== "undefined" ? resolveBaseUrl() : "/api"

export function getAdtUrl(label: string): string {
  return `${BASE_URL}/books/${label}/adt`
}

export function getAudioUrl(label: string, language: string, fileName: string): string {
  return `${BASE_URL}/books/${label}/audio/${language}/${fileName}`
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
    const body = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(body.error ?? `Request failed: ${res.status}`)
  }

  return res.json()
}

export interface BookSummary {
  label: string
  title: string | null
  authors: string[]
  publisher: string | null
  languageCode: string | null
  pageCount: number
  hasSourcePdf: boolean
  needsRebuild: boolean
  rebuildReason: string | null
}

export interface BookDetail extends BookSummary {
  metadata: {
    title: string | null
    authors: string[]
    publisher: string | null
    language_code: string | null
    cover_page_number: number | null
    reasoning: string
  } | null
  bookSummary: {
    summary: string
  } | null
}

export interface AzureCredentials {
  key: string
  region: string
}

export interface RunStagesOptions {
  fromStage: string
  toStage: string
  /** When true, skip page-sectioning and only re-render from existing section data. */
  renderOnly?: boolean
}

function buildApiHeaders(
  apiKey: string,
  azure?: AzureCredentials
): Record<string, string> {
  const headers: Record<string, string> = { "X-OpenAI-Key": apiKey }
  if (azure?.key) headers["X-Azure-Speech-Key"] = azure.key
  if (azure?.region) headers["X-Azure-Speech-Region"] = azure.region
  return headers
}

export interface StageRunStatus {
  label: string
  status: "idle" | "running" | "completed" | "failed"
  fromStage?: string
  toStage?: string
  error?: string
  startedAt?: number
  completedAt?: number
  queue?: Array<{ id: string; fromStage: string; toStage: string }>
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
}

export interface SectionRendering {
  sectionIndex: number
  sectionType: string
  reasoning: string
  html: string
  activityReasoning?: string
  activityAnswers?: Record<string, string | boolean | number>
}

export interface PageDetail {
  pageId: string
  pageNumber: number
  text: string
  textClassification: {
    reasoning: string
    groups: Array<{
      groupId: string
      groupType: string
      texts: Array<{ textType: string; text: string; isPruned: boolean }>
    }>
  } | null
  imageClassification: {
    images: Array<{
      imageId: string
      isPruned: boolean
      reason?: string
    }>
  } | null
  sectioning: {
    reasoning: string
    sections: Array<{
      sectionId: string
      sectionType: string
      parts: Array<
        | {
            type: "text_group"
            groupId: string
            groupType: string
            texts: Array<{ textId: string; textType: string; text: string; isPruned: boolean }>
            isPruned: boolean
          }
        | {
            type: "image"
            imageId: string
            isPruned: boolean
            reason?: string
          }
      >
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
    captions: Array<{ imageId: string; reasoning: string; caption: string }>
  } | null
  versions: {
    textClassification: number | null
    imageClassification: number | null
    sectioning: number | null
    rendering: number | null
    imageCaptioning: number | null
  }
}

// --- Glossary types ---

export interface GlossaryItem {
  word: string
  definition: string
  variations: string[]
  emojis: string[]
}

export interface GlossaryOutput {
  items: GlossaryItem[]
  pageCount: number
  generatedAt: string
  version: number
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

// --- TTS types ---

export interface TTSEntry {
  textId: string
  fileName: string
  voice: string
  model: string
  cached: boolean
}

export interface TTSLanguageData {
  entries: TTSEntry[]
  generatedAt: string
  version: number
}

export interface TTSResponse {
  languages: Record<string, TTSLanguageData>
}

// --- Debug types ---

export interface LlmLogEntry {
  id: number
  timestamp: string
  step: string
  itemId: string
  data: {
    promptName: string
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

export interface ActiveConfigResponse {
  merged: Record<string, unknown>
  hasBookOverride: boolean
}

export interface VersionEntry {
  version: number
  data?: unknown
}

export interface VersionListResponse {
  versions: VersionEntry[]
}

export interface LlmLogsParams {
  step?: string
  itemId?: string
  limit?: number
  offset?: number
}

export const api = {
  getBooks: () => request<BookSummary[]>("/books"),

  getBook: (label: string) => request<BookDetail>(`/books/${label}`),

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

  runStages: (
    label: string,
    apiKey: string,
    options: RunStagesOptions,
    azure?: AzureCredentials
  ) =>
    request<{ status: string; label: string; fromStage: string; toStage: string }>(
      `/books/${label}/stages/run`,
      {
        method: "POST",
        headers: buildApiHeaders(apiKey, azure),
        body: JSON.stringify(options),
      }
    ),

  getStagesStatus: (label: string) =>
    request<StageRunStatus>(`/books/${label}/stages/status`),

  getPages: (label: string) =>
    request<PageSummaryItem[]>(`/books/${label}/pages`),

  getPage: (label: string, pageId: string) =>
    request<PageDetail>(`/books/${label}/pages/${pageId}`),

  getPageImage: (label: string, pageId: string) =>
    request<{ imageBase64: string }>(`/books/${label}/pages/${pageId}/image`),

  updateTextClassification: (label: string, pageId: string, data: unknown) =>
    request<{ version: number }>(`/books/${label}/pages/${pageId}/text-classification`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

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

  reRenderPage: (label: string, pageId: string, apiKey: string, sectionIndex?: number) =>
    request<{ version: number; rendering: { sections: SectionRendering[] } }>(
      `/books/${label}/pages/${pageId}/re-render${sectionIndex !== undefined ? `?sectionIndex=${sectionIndex}` : ""}`,
      {
        method: "POST",
        headers: { "X-OpenAI-Key": apiKey },
        signal: AbortSignal.timeout(120_000),
      }
    ),

  aiEditSection: (
    label: string,
    pageId: string,
    sectionIndex: number,
    instruction: string,
    apiKey: string,
    currentHtml?: string,
    signal?: AbortSignal
  ) =>
    request<{ html: string; reasoning: string }>(
      `/books/${label}/pages/${pageId}/sections/${sectionIndex}/ai-edit`,
      {
        method: "POST",
        headers: { "X-OpenAI-Key": apiKey },
        body: JSON.stringify({ instruction, currentHtml }),
        signal: signal ?? AbortSignal.timeout(120_000),
      }
    ),

  cloneSection: (label: string, pageId: string, sectionIndex: number) =>
    request<{ clonedSectionIndex: number; sectioningVersion: number; renderingVersion: number | null }>(
      `/books/${label}/pages/${pageId}/sections/${sectionIndex}/clone`,
      { method: "POST" }
    ),

  mergeSection: (label: string, pageId: string, sectionIndex: number, direction: "next" | "prev" = "next") =>
    request<{ mergedSectionIndex: number; sectioningVersion: number; renderingVersion: number | null }>(
      `/books/${label}/pages/${pageId}/sections/${sectionIndex}/merge?direction=${direction}`,
      { method: "POST" }
    ),

  deleteSection: (label: string, pageId: string, sectionIndex: number) =>
    request<{ sectioningVersion: number; renderingVersion: number | null; remainingSections: number }>(
      `/books/${label}/pages/${pageId}/sections/${sectionIndex}`,
      { method: "DELETE" }
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

  aiGenerateImage: (label: string, pageId: string, prompt: string, apiKey: string, targetImageId: string, referenceImageId?: string, signal?: AbortSignal) =>
    request<{ imageId: string; width: number; height: number; originalWidth: number; originalHeight: number }>(
      `/books/${label}/images/ai-generate?pageId=${pageId}`,
      {
        method: "POST",
        headers: { "X-OpenAI-Key": apiKey },
        body: JSON.stringify({ prompt, targetImageId, referenceImageId }),
        signal: signal ?? AbortSignal.timeout(180_000),
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

  getPrompt: (name: string, bookLabel?: string) =>
    request<{ name: string; content: string; source?: string }>(
      bookLabel ? `/books/${bookLabel}/prompts/${name}` : `/prompts/${name}`
    ),

  updatePrompt: (name: string, content: string, bookLabel?: string) =>
    request<{ name: string; content: string; source?: string }>(
      bookLabel ? `/books/${bookLabel}/prompts/${name}` : `/prompts/${name}`,
      { method: "PUT", body: JSON.stringify({ content }) },
    ),

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

  getGlossary: (label: string) =>
    request<GlossaryOutput | null>(`/books/${label}/glossary`),

  updateGlossary: (label: string, data: unknown) =>
    request<{ version: number }>(`/books/${label}/glossary`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  getTextCatalog: (label: string) =>
    request<TextCatalogResponse | null>(`/books/${label}/text-catalog`),

  updateTranslation: (label: string, language: string, data: unknown) =>
    request<{ version: number }>(`/books/${label}/text-catalog-translation/${language}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  getStepStatus: (label: string) =>
    request<{ stages: Record<string, string>; steps: Record<string, string>; error: string | null; stepErrors: Record<string, string> | null }>(`/books/${label}/step-status`),

  getTTS: (label: string) =>
    request<TTSResponse>(`/books/${label}/tts`),

  packageAdt: (label: string) =>
    request<{ status: string; label: string }>(
      `/books/${label}/package-adt`,
      { method: "POST" }
    ),

  getPackageAdtStatus: (label: string) =>
    request<{ label: string; hasAdt: boolean }>(
      `/books/${label}/package-adt/status`
    ),

  getTemplates: () =>
    request<{ templates: string[] }>(`/templates`),

  getPreset: (name: string) =>
    request<{ config: Record<string, unknown> }>(`/presets/${name}`),

  getStyleguides: () =>
    request<{ styleguides: string[] }>(`/styleguides`),

  getStyleguidePreview: (name: string) =>
    request<{ name: string; html: string }>(`/styleguides/${name}/preview`),

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

  getGlobalConfig: () =>
    request<{ config: Record<string, unknown> }>(`/config`),

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

  exportBook: async (label: string): Promise<Blob> => {
    const url = `${BASE_URL}/books/${label}/export`
    const res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/zip" },
      mode: "cors",
      signal: AbortSignal.timeout(300_000),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText }))
      throw new Error(body.error ?? `Export failed: ${res.status}`)
    }
    const buf = await res.arrayBuffer()
    return new Blob([buf], { type: "application/zip" })
  },
}
