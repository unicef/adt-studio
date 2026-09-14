import { randomUUID } from "node:crypto"
import { safeParseModelId } from "@adt/types"
import {
  computeCacheKeyV2,
  computeHash,
  isLegacyCacheReadable,
  readCache,
  writeCache,
} from "./cache.js"
import type { ResolvedCredentials } from "./credentials.js"
import { mergeResolvedCredentials } from "./legacy-credentials.js"
import { formatProviderError } from "./error-format.js"
import { sanitizeMessages, type LlmLogEntry } from "./log.js"
import { createLogger, type LogLevel } from "./logger.js"
import { AiProviderError } from "./ports/errors.js"
import type { ImageResult } from "./ports/image-backend.js"
import { getDefaultProviderRegistry } from "./providers/index.js"
import type { ProviderRegistry } from "./registry.js"
import type { Message } from "./types.js"

export interface GenerateImageWithCacheOptions {
  /** @deprecated Direct key; prefer `providerCredentials` so callers stay
   *  provider-agnostic. Mapped to the model's provider as its `apiKey` field. */
  apiKey?: string
  providerCredentials?: ResolvedCredentials
  /** Isolated registry for tests; defaults to the built-in one. */
  registry?: ProviderRegistry
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

export async function generateImageWithCache(
  options: GenerateImageWithCacheOptions
): Promise<GenerateImageWithCacheResult> {
  const {
    modelId,
    prompt,
    size,
    referenceImages = [],
    cacheDir,
    timeoutMs = 180_000,
    log: logOptions,
    onLog,
    logLevel,
    signal,
  } = options

  const logger = createLogger(logLevel)
  const registry = options.registry ?? getDefaultProviderRegistry()
  const startedAt = Date.now()
  const requestId = randomUUID()
  const messages = buildMessages(prompt, referenceImages)
  const label = logOptions
    ? `${logOptions.taskType}${logOptions.pageId ? ` ${logOptions.pageId}` : ""}`
    : modelId

  // Resolve the backend once: provider, model and fingerprint are identical
  // across the cache read and the call, and must enter the key before the read.
  // A resolution failure is a configuration error — logged once, never retried.
  let resolved
  try {
    resolved = registry.resolveImage(modelId, {
      credentials: resolveCredentials(options),
      logLevel,
    })
  } catch (error) {
    const message = formatProviderError(error)
    logger.error(`[LLM] ${label} | error | ${message}`)
    emitFailureLog({ requestId, modelId, startedAt, messages, logOptions, onLog, message })
    throw error
  }

  // referenceImageCount fully separates edit (>0) from generate (0), so the same
  // schema shape serves the v2 key and the reproduced v1 key.
  const schema = {
    type: "image-generation",
    size,
    referenceImageCount: referenceImages.length,
  }
  const hash = computeCacheKeyV2({
    providerId: resolved.providerId,
    modelId: resolved.modelId,
    fingerprint: resolved.fingerprint,
    operation: "image",
    messages,
    schema,
  })
  // Reproduce the exact v1 key so a legacy entry from a fixed-origin backend
  // still counts as a hit; configurable-origin providers skip it.
  const legacyHash = isLegacyCacheReadable(resolved.fingerprint)
    ? computeHash({ modelId, messages, schema })
    : null

  if (cacheDir) {
    const cached = readCache<ImageResult>(cacheDir, hash)
    if (cached) {
      logger.info(`[LLM] ${label} | cached | ${Date.now() - startedAt}ms`)
      emitLog({ requestId, modelId, startedAt, messages, logOptions, onLog, result: cached, cacheHit: true })
      return { ...cached, cached: true }
    }
    const legacyCached = legacyHash ? readCache<ImageResult>(cacheDir, legacyHash) : null
    if (legacyCached) {
      // Promote the legacy hit into v2 so future reads skip the fallback.
      writeCache(cacheDir, hash, legacyCached)
      logger.info(`[LLM] ${label} | cached | ${Date.now() - startedAt}ms`)
      emitLog({ requestId, modelId, startedAt, messages, logOptions, onLog, result: legacyCached, cacheHit: true })
      return { ...legacyCached, cached: true }
    }
  }

  try {
    let result: ImageResult
    if (referenceImages.length > 0) {
      if (!resolved.backend.edit) {
        throw AiProviderError.unsupportedCapability(
          resolved.providerId,
          "image",
          "edit",
          resolved.modelId,
        )
      }
      result = await resolved.backend.edit({ prompt, size, referenceImages, timeoutMs, signal })
    } else {
      result = await resolved.backend.generate({ prompt, size, timeoutMs, signal })
    }

    if (cacheDir) {
      writeCache(cacheDir, hash, result)
    }

    logger.info(`[LLM] ${label} | ok | ${Date.now() - startedAt}ms`)
    emitLog({ requestId, modelId, startedAt, messages, logOptions, onLog, result, cacheHit: false })

    return { ...result, cached: false }
  } catch (error) {
    const message = formatProviderError(error)
    logger.error(`[LLM] ${label} | error | ${message}`)
    emitFailureLog({ requestId, modelId, startedAt, messages, logOptions, onLog, message })
    throw error
  }
}

/**
 * Credentials come from the provider registry so callers pass the whole
 * request-scoped set. The deprecated `apiKey` maps to the model's provider.
 */
function resolveCredentials(
  options: GenerateImageWithCacheOptions,
): ResolvedCredentials | undefined {
  const direct = options.apiKey?.trim()
  if (!direct) return options.providerCredentials
  const parsed = safeParseModelId(options.modelId)
  const providerId = parsed.ok ? parsed.value.providerId : "openai"
  return mergeResolvedCredentials(options.providerCredentials, {
    [providerId]: { apiKey: direct },
  })
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

function emitLog(options: {
  requestId: string
  modelId: string
  startedAt: number
  messages: Message[]
  logOptions?: GenerateImageWithCacheOptions["log"]
  onLog?: GenerateImageWithCacheOptions["onLog"]
  result: ImageResult
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

function emitFailureLog(options: {
  requestId: string
  modelId: string
  startedAt: number
  messages: Message[]
  logOptions?: GenerateImageWithCacheOptions["log"]
  onLog?: GenerateImageWithCacheOptions["onLog"]
  message: string
}): void {
  const { logOptions, onLog } = options
  if (!logOptions || !onLog) return

  onLog({
    requestId: options.requestId,
    timestamp: new Date().toISOString(),
    taskType: logOptions.taskType,
    pageId: logOptions.pageId,
    promptName: logOptions.promptName,
    modelId: options.modelId,
    cacheHit: false,
    success: false,
    errorCount: 1,
    attempt: 0,
    durationMs: Date.now() - options.startedAt,
    validationErrors: [options.message],
    messages: sanitizeMessages(options.messages),
  })
}
