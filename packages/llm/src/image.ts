import { randomUUID } from "node:crypto"
import { computeHash, readCache, writeCache } from "./cache.js"
import { sanitizeMessages, type LlmLogEntry } from "./log.js"
import { createLogger, type LogLevel } from "./logger.js"
import type { Message } from "./types.js"

export interface GenerateImageWithCacheOptions {
  apiKey: string
  modelId: string
  prompt: string
  size?: `${number}x${number}`
  referenceImages?: Array<{
    data: Buffer
    mimeType?: string
    name?: string
  }>
  cacheDir?: string
  timeoutMs?: number
  log?: {
    taskType: string
    pageId?: string
    promptName: string
  }
  onLog?: (entry: LlmLogEntry) => void
  logLevel?: LogLevel
  /** External cancellation signal, combined with the internal timeout. */
  signal?: AbortSignal
}

export interface GenerateImageWithCacheResult {
  base64: string
  mimeType: string
  cached: boolean
}

interface CachedImageResult {
  base64: string
  mimeType: string
}

export async function generateImageWithCache(
  options: GenerateImageWithCacheOptions
): Promise<GenerateImageWithCacheResult> {
  const {
    apiKey,
    modelId,
    prompt,
    size,
    referenceImages = [],
    cacheDir,
    timeoutMs = 180_000,
    log: logOptions,
    onLog,
    logLevel,
    signal: externalSignal,
  } = options

  const logger = createLogger(logLevel)
  const startedAt = Date.now()
  const requestId = randomUUID()
  const messages = buildMessages(prompt, referenceImages)
  const hash = computeHash({
    modelId,
    messages,
    schema: {
      type: "image-generation",
      size,
      referenceImageCount: referenceImages.length,
    },
  })
  const label = logOptions
    ? `${logOptions.taskType}${logOptions.pageId ? ` ${logOptions.pageId}` : ""}`
    : modelId

  if (cacheDir) {
    const cached = readCache<CachedImageResult>(cacheDir, hash)
    if (cached) {
      logger.info(`[LLM] ${label} | cached | ${Date.now() - startedAt}ms`)
      emitLog({
        requestId,
        modelId,
        startedAt,
        messages,
        logOptions,
        onLog,
        result: cached,
        cacheHit: true,
      })
      return { ...cached, cached: true }
    }
  }

  try {
    const timeoutSignal = timeoutMs > 0 ? AbortSignal.timeout(timeoutMs) : undefined
    const abortSignal =
      timeoutSignal && externalSignal
        ? AbortSignal.any([timeoutSignal, externalSignal])
        : (timeoutSignal ?? externalSignal)
    const result =
      referenceImages.length > 0
        ? await editImage({
            apiKey,
            modelId: stripProvider(modelId),
            prompt,
            size,
            referenceImages,
            abortSignal,
          })
        : await generateFreshImage({
            apiKey,
            modelId: stripProvider(modelId),
            prompt,
            size,
            abortSignal,
          })

    if (cacheDir) {
      writeCache(cacheDir, hash, result)
    }

    logger.info(`[LLM] ${label} | ok | ${Date.now() - startedAt}ms`)
    emitLog({
      requestId,
      modelId,
      startedAt,
      messages,
      logOptions,
      onLog,
      result,
      cacheHit: false,
    })

    return { ...result, cached: false }
  } catch (error) {
    const message = formatError(error)
    logger.error(`[LLM] ${label} | error | ${message}`)

    if (logOptions && onLog) {
      onLog({
        requestId,
        timestamp: new Date().toISOString(),
        taskType: logOptions.taskType,
        pageId: logOptions.pageId,
        promptName: logOptions.promptName,
        modelId,
        cacheHit: false,
        success: false,
        errorCount: 1,
        attempt: 0,
        durationMs: Date.now() - startedAt,
        validationErrors: [message],
        messages: sanitizeMessages(messages),
      })
    }

    throw error
  }
}

function stripProvider(modelId: string): string {
  const [provider, rawModelId] = modelId.includes(":")
    ? modelId.split(":", 2)
    : ["openai", modelId]

  if (provider !== "openai") {
    throw new Error(`Unsupported image provider: ${provider}`)
  }

  return rawModelId
}

function buildMessages(
  prompt: string,
  referenceImages: GenerateImageWithCacheOptions["referenceImages"]
): Message[] {
  return [
    {
      role: "user",
      content: [
        { type: "text", text: prompt },
        ...(referenceImages ?? []).map((image) => ({
          type: "image" as const,
          image: image.data.toString("base64"),
        })),
      ],
    },
  ]
}

// Direct fetch instead of @ai-sdk/openai for the generations endpoint: that SDK
// auto-injects `response_format: "b64_json"` for any model not in its hardcoded
// `hasDefaultResponseFormat` set (currently just "gpt-image-1"), and the OpenAI
// API rejects that parameter for newer gpt-image-* variants —
// "Unknown parameter: 'response_format'".
async function callOpenAiImageApi(options: {
  apiKey: string
  endpoint: "generations" | "edits"
  body: string | FormData
  jsonBody?: boolean
  abortSignal?: AbortSignal
}): Promise<CachedImageResult> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${options.apiKey}`,
  }
  if (options.jsonBody) headers["Content-Type"] = "application/json"

  const response = await fetch(`https://api.openai.com/v1/images/${options.endpoint}`, {
    method: "POST",
    headers,
    body: options.body,
    signal: options.abortSignal,
  })

  const text = await response.text()
  if (!response.ok) {
    throw new Error(parseOpenAiError(text, response.status))
  }

  const data = JSON.parse(text) as { data?: Array<{ b64_json?: string }> }
  const base64 = data.data?.[0]?.b64_json
  if (!base64) {
    throw new Error("No image data returned from OpenAI")
  }

  return { base64, mimeType: "image/png" }
}

async function generateFreshImage(options: {
  apiKey: string
  modelId: string
  prompt: string
  size?: `${number}x${number}`
  abortSignal?: AbortSignal
}): Promise<CachedImageResult> {
  const body: Record<string, unknown> = {
    model: options.modelId,
    prompt: options.prompt,
    output_format: "png",
  }
  if (options.size) body.size = options.size

  return callOpenAiImageApi({
    apiKey: options.apiKey,
    endpoint: "generations",
    body: JSON.stringify(body),
    jsonBody: true,
    abortSignal: options.abortSignal,
  })
}

async function editImage(options: {
  apiKey: string
  modelId: string
  prompt: string
  size?: `${number}x${number}`
  referenceImages: NonNullable<GenerateImageWithCacheOptions["referenceImages"]>
  abortSignal?: AbortSignal
}): Promise<CachedImageResult> {
  const formData = new FormData()
  formData.append("model", options.modelId)
  formData.append("prompt", options.prompt)
  if (options.size) formData.append("size", options.size)
  formData.append("output_format", "png")

  for (const [index, image] of options.referenceImages.entries()) {
    formData.append(
      "image",
      new Blob([image.data], { type: image.mimeType ?? "image/png" }),
      image.name ?? `reference-${index + 1}.png`
    )
  }

  return callOpenAiImageApi({
    apiKey: options.apiKey,
    endpoint: "edits",
    body: formData,
    abortSignal: options.abortSignal,
  })
}

function emitLog(options: {
  requestId: string
  modelId: string
  startedAt: number
  messages: Message[]
  logOptions?: GenerateImageWithCacheOptions["log"]
  onLog?: GenerateImageWithCacheOptions["onLog"]
  result: CachedImageResult
  cacheHit: boolean
}): void {
  const { logOptions, onLog } = options
  if (!logOptions || !onLog) return

  const assistantMessages: Message[] = [
    {
      role: "assistant",
      content: [
        { type: "text", text: "Generated image" },
        { type: "image", image: options.result.base64 },
      ],
    },
  ]

  onLog({
    requestId: options.requestId,
    timestamp: new Date().toISOString(),
    taskType: logOptions.taskType,
    pageId: logOptions.pageId,
    promptName: logOptions.promptName,
    modelId: options.modelId,
    cacheHit: options.cacheHit,
    success: true,
    errorCount: 0,
    attempt: 0,
    durationMs: Date.now() - options.startedAt,
    messages: sanitizeMessages([...options.messages, ...assistantMessages]),
  })
}

function parseOpenAiError(body: string, status: number): string {
  try {
    const parsed = JSON.parse(body) as {
      error?: {
        message?: string
      }
    }
    return parsed.error?.message ?? `OpenAI API error: ${status}`
  } catch {
    return `OpenAI API error: ${status}`
  }
}

function formatError(error: unknown): string {
  if (error instanceof DOMException && error.name === "TimeoutError") {
    return `Timeout: ${error.message}`
  }
  return error instanceof Error ? error.message : String(error)
}
