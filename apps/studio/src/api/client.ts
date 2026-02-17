function resolveBaseUrl(): string {
  if (
    window.location.protocol === "tauri:" ||
    window.location.hostname === "tauri.localhost"
  ) {
    return "http://localhost:3001/api"
  }
  return "/api"
}

const BASE_URL = resolveBaseUrl()

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
  storyboardAccepted: boolean
  proofCompleted: boolean
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
}

export interface PipelineStatus {
  label: string
  status: "idle" | "running" | "completed" | "failed"
  error?: string
  startedAt?: number
  completedAt?: number
}

export interface ProofStatus {
  label: string
  status: "idle" | "running" | "completed" | "failed"
  error?: string
  startedAt?: number
  completedAt?: number
}

export interface MasterStatus {
  label: string
  status: "idle" | "running" | "completed" | "failed"
  error?: string
  startedAt?: number
  completedAt?: number
}

export interface RunPipelineOptions {
  startPage?: number
  endPage?: number
}

export interface PageSummaryItem {
  pageId: string
  pageNumber: number
  hasRendering: boolean
  textPreview: string
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
      sectionType: string
      partIds: string[]
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

// --- TTS types ---

export interface TTSEntry {
  textId: string
  fileName: string
  language: string
}

export interface TTSResponse {
  entries: TTSEntry[]
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

  runPipeline: (
    label: string,
    apiKey: string,
    options?: RunPipelineOptions
  ) =>
    request<{ status: string; label: string }>(
      `/books/${label}/pipeline/run`,
      {
        method: "POST",
        headers: { "X-OpenAI-Key": apiKey },
        body: options ? JSON.stringify(options) : undefined,
      }
    ),

  getPipelineStatus: (label: string) =>
    request<PipelineStatus>(`/books/${label}/pipeline/status`),

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
    request<{ version: number }>(`/books/${label}/pages/${pageId}/image-classification`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  updateSectioning: (label: string, pageId: string, data: unknown) =>
    request<{ version: number }>(`/books/${label}/pages/${pageId}/sectioning`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  reRenderPage: (label: string, pageId: string, apiKey: string) =>
    request<{ version: number; rendering: { sections: SectionRendering[] } }>(
      `/books/${label}/pages/${pageId}/re-render`,
      {
        method: "POST",
        headers: { "X-OpenAI-Key": apiKey },
        signal: AbortSignal.timeout(120_000),
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

  runProof: (label: string, apiKey: string) =>
    request<{ status: string; label: string }>(
      `/books/${label}/proof/run`,
      { method: "POST", headers: { "X-OpenAI-Key": apiKey } }
    ),

  getProofStatus: (label: string) =>
    request<ProofStatus>(`/books/${label}/proof/status`),

  runMaster: (label: string, apiKey: string) =>
    request<{ status: string; label: string }>(
      `/books/${label}/master/run`,
      { method: "POST", headers: { "X-OpenAI-Key": apiKey } }
    ),

  getMasterStatus: (label: string) =>
    request<MasterStatus>(`/books/${label}/master/status`),

  acceptStoryboard: (label: string) =>
    request<{ version: number; acceptedAt: string }>(
      `/books/${label}/accept-storyboard`,
      { method: "POST" }
    ),

  getQuizzes: (label: string) =>
    request<QuizzesResponse>(`/books/${label}/quizzes`),

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

  getPreset: (name: string) =>
    request<{ config: Record<string, unknown> }>(`/presets/${name}`),

  getGlobalConfig: () =>
    request<{ config: Record<string, unknown> }>(`/config`),

  exportBook: async (label: string, format: "web" | "epub" = "web"): Promise<Blob> => {
    const url = `${BASE_URL}/books/${label}/export?format=${format}`
    const res = await fetch(url)
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText }))
      throw new Error(body.error ?? `Export failed: ${res.status}`)
    }
    return res.blob()
  },
}
