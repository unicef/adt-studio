import { randomUUID } from "node:crypto"
import { generateObject, APICallError, NoObjectGeneratedError, type LanguageModel, type CoreMessage } from "ai"
import { createOpenAI, openai } from "@ai-sdk/openai"
import { anthropic, createAnthropic } from "@ai-sdk/anthropic"
import { google, createGoogleGenerativeAI } from "@ai-sdk/google"
import type {
  LLMModel,
  GenerateObjectOptions,
  GenerateObjectResult,
  Message,
  TokenUsage,
} from "./types.js"
import type { PromptEngine } from "./prompt.js"
import type { RateLimiter } from "./rate-limiter.js"
import { computeHash, readCache, writeCache, bustCache } from "./cache.js"
import { sanitizeMessages, type LlmLogEntry } from "./log.js"
import { createLogger, type LogLevel } from "./logger.js"

export interface LLMProviderCredentials {
  openaiApiKey?: string
  anthropicApiKey?: string
  googleApiKey?: string
  customBaseUrl?: string
  customApiKey?: string
  defaultModelId?: string
  /** Model IDs explicitly selected for individual steps. */
  explicitModelIds?: string[]
}

const FALLBACK_MODELS = {
  openai: "gpt-5.4",
  anthropic: "claude-sonnet-4-6",
  google: "gemini-2.5-pro",
  custom: "your-model-name",
} as const

/** Resolve an unavailable configured provider to the first request-scoped credential. */
export function resolveEffectiveModelId(
  modelId: string,
  credentials?: LLMProviderCredentials,
): string {
  if (!credentials) return modelId
  const requestedProvider = modelId.includes(":") ? modelId.slice(0, modelId.indexOf(":")) : "openai"
  const available = [
    credentials.openaiApiKey && "openai",
    credentials.anthropicApiKey && "anthropic",
    credentials.googleApiKey && "google",
    credentials.customBaseUrl && "custom",
  ].filter(Boolean) as Array<keyof typeof FALLBACK_MODELS>
  if (available.length === 0 || available.includes(requestedProvider as keyof typeof FALLBACK_MODELS)) {
    if (
      credentials.defaultModelId &&
      !credentials.explicitModelIds?.includes(modelId)
    ) {
      const defaultProvider = credentials.defaultModelId.includes(":")
        ? credentials.defaultModelId.slice(0, credentials.defaultModelId.indexOf(":"))
        : "openai"
      if (available.includes(defaultProvider as keyof typeof FALLBACK_MODELS)) {
        return credentials.defaultModelId
      }
    }
    return modelId
  }
  const preferred = credentials.defaultModelId
  if (preferred) {
    const preferredProvider = (preferred.includes(":") ? preferred.slice(0, preferred.indexOf(":")) : "openai") as keyof typeof FALLBACK_MODELS
    if (available.includes(preferredProvider)) return preferred
  }
  const provider = available[0]
  return `${provider}:${FALLBACK_MODELS[provider]}`
}

export interface CreateLLMModelOptions {
  modelId: string // "openai:gpt-5.4" format
  cacheDir?: string
  promptEngine?: PromptEngine
  onLog?: (entry: LlmLogEntry) => void
  rateLimiter?: RateLimiter
  credentials?: LLMProviderCredentials
  /** Console log level. Defaults to "info" (show all). Use "silent" to suppress. */
  logLevel?: LogLevel
}

/**
 * Create an LLM model with optional caching and logging.
 *
 * Wraps the Vercel AI SDK's generateObject() with:
 * - Disk-based response caching (SHA-256 hash of inputs)
 * - Validation with retry loops
 * - Structured logging (images replaced with hash placeholders)
 * - Optional prompt rendering (pass promptEngine + use prompt option)
 */
export function createLLMModel(options: CreateLLMModelOptions): LLMModel {
  const { cacheDir, promptEngine, onLog, rateLimiter, credentials, logLevel } = options
  const modelId = resolveEffectiveModelId(options.modelId, credentials)
  const log = createLogger(logLevel)

  return {
    async renderPrompt(name: string, context: Record<string, unknown>): Promise<Message[]> {
      if (!promptEngine) {
        throw new Error("promptEngine required for renderPrompt")
      }
      return promptEngine.renderPrompt(name, context)
    },

    async generateObject<T>(
      opts: GenerateObjectOptions
    ): Promise<GenerateObjectResult<T>> {
      // Resolve prompt to system + messages if needed
      let system = opts.system
      let messages = opts.messages ?? []

      const context = opts.context ?? {}

      if (opts.prompt) {
        if (!promptEngine) {
          throw new Error("promptEngine required when using prompt option")
        }
        const allMessages = await promptEngine.renderPrompt(
          opts.prompt,
          context
        )
        const systemMsg = allMessages.find((m) => m.role === "system")
        system =
          typeof systemMsg?.content === "string"
            ? systemMsg.content
            : undefined
        messages = allMessages.filter((m) => m.role !== "system")
      }

      const maxRetries = opts.maxRetries ?? 0
      const objectMode = resolveObjectMode(modelId, opts.mode)
      const t0 = Date.now()
      const requestId = randomUUID()

      let currentMessages = messages
      let allErrors: string[] = []
      let lastCacheHit = false
      let totalUsage: TokenUsage = { inputTokens: 0, outputTokens: 0 }

      const label = opts.log
        ? `${opts.log.taskType}${opts.log.pageId ? ` ${opts.log.pageId}` : ""}`
        : modelId
      log.info(
        `[LLM] ${label} | model=${modelId}` +
        `${modelId !== options.modelId ? ` | requested=${options.modelId}` : ""}` +
        ` | mode=${objectMode ?? "auto"} | start`
      )

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const hash = computeHash({
          modelId,
          mode: objectMode,
          system,
          messages: currentMessages,
          schema: opts.schema,
          temperature: opts.temperature,
        })

        try {
          let result: T

          // Check cache
          if (cacheDir) {
            const cached = readCache<T>(cacheDir, hash)
            if (cached !== null) {
              result = cached
              lastCacheHit = true
            } else {
              if (rateLimiter) await rateLimiter.acquire()
              const generated = await callLLM<T>(
                resolveModel(modelId, credentials, {
                  structuredOutputs: opts.mode === "json" ? false : undefined,
                }),
                opts,
                system,
                currentMessages,
                objectMode,
              )
              result = generated.object
              totalUsage.inputTokens += generated.usage.inputTokens
              totalUsage.outputTokens += generated.usage.outputTokens
              lastCacheHit = false
              writeCache(cacheDir, hash, result)
            }
          } else {
            if (rateLimiter) await rateLimiter.acquire()
            const generated = await callLLM<T>(
              resolveModel(modelId, credentials, {
                structuredOutputs: opts.mode === "json" ? false : undefined,
              }),
              opts,
              system,
              currentMessages,
              objectMode,
            )
            result = generated.object
            totalUsage.inputTokens += generated.usage.inputTokens
            totalUsage.outputTokens += generated.usage.outputTokens
            lastCacheHit = false
          }

          // Validate if validator provided
          if (opts.validate) {
            const check = opts.validate(result, context)
            if (!check.valid) {
              allErrors.push(...check.errors)
              if (cacheDir) bustCache(cacheDir, hash)
              currentMessages = appendValidationFeedback(
                currentMessages,
                result,
                check.errors
              )
              log.info(
                `[LLM] ${label} | validation failed (attempt ${attempt + 1}/${maxRetries + 1}) | retrying`
              )
              if (opts.log && onLog) {
                onLog({
                  requestId,
                  timestamp: new Date().toISOString(),
                  taskType: opts.log.taskType,
                  pageId: opts.log.pageId,
                  promptName: opts.log.promptName,
                  sectionIndex: opts.log.sectionIndex,
                  correlationId: opts.log.correlationId,
                  modelId,
                  cacheHit: lastCacheHit,
                  success: false,
                  errorCount: allErrors.length,
                  attempt,
                  durationMs: Date.now() - t0,
                  usage:
                    totalUsage.inputTokens > 0 || totalUsage.outputTokens > 0
                      ? totalUsage
                      : undefined,
                  validationErrors: allErrors.length > 0 ? allErrors : undefined,
                  messages: sanitizeMessages(
                    buildLogMessages(system, currentMessages, null)
                  ),
                })
              }
              continue
            }
            if (check.cleaned !== undefined) {
              result = check.cleaned as T
            }
          }

          const durationMs = Date.now() - t0
          if (lastCacheHit) {
            log.info(`[LLM] ${label} | cached | ${durationMs}ms`)
          } else {
            const tokens = `${totalUsage.inputTokens}+${totalUsage.outputTokens} tokens`
            log.info(
              `[LLM] ${label} | ok${attempt > 0 ? ` (attempt ${attempt + 1}/${maxRetries + 1})` : ""} | ${durationMs}ms | ${tokens}`
            )
          }

          // Log and return
          if (opts.log && onLog) {
            onLog({
              requestId,
              timestamp: new Date().toISOString(),
              taskType: opts.log.taskType,
              pageId: opts.log.pageId,
              promptName: opts.log.promptName,
              sectionIndex: opts.log.sectionIndex,
              correlationId: opts.log.correlationId,
              modelId,
              cacheHit: lastCacheHit,
              success: true,
              errorCount: allErrors.length,
              attempt,
              durationMs: Date.now() - t0,
              usage:
                totalUsage.inputTokens > 0 || totalUsage.outputTokens > 0
                  ? totalUsage
                  : undefined,
              validationErrors: allErrors.length > 0 ? allErrors : undefined,
              messages: sanitizeMessages(
                buildLogMessages(system, currentMessages, result)
              ),
            })
          }

          return {
            object: result,
            usage: totalUsage,
            cached: lastCacheHit,
          }
        } catch (err) {
          const errMsg = formatError(err)
          allErrors.push(errMsg)
          if (cacheDir) bustCache(cacheDir, hash)

          if (attempt < maxRetries) {
            const delayMs = backoffDelay(attempt)
            log.error(
              `[LLM] ${label} | error (attempt ${attempt + 1}/${maxRetries + 1}) | ${errMsg} | retrying in ${delayMs}ms`
            )
            if (opts.log && onLog) {
              onLog({
                requestId,
                timestamp: new Date().toISOString(),
                taskType: opts.log.taskType,
                pageId: opts.log.pageId,
                promptName: opts.log.promptName,
                sectionIndex: opts.log.sectionIndex,
                correlationId: opts.log.correlationId,
                modelId,
                cacheHit: false,
                success: false,
                errorCount: allErrors.length,
                attempt,
                durationMs: Date.now() - t0,
                usage:
                  totalUsage.inputTokens > 0 || totalUsage.outputTokens > 0
                    ? totalUsage
                    : undefined,
                validationErrors: allErrors,
                messages: sanitizeMessages(
                  buildLogMessages(system, currentMessages, null)
                ),
              })
            }
            await sleep(delayMs)
            continue
          }

          log.error(
            `[LLM] ${label} | error (attempt ${attempt + 1}/${maxRetries + 1}) | ${errMsg}`
          )

          if (opts.log && onLog) {
            onLog({
              requestId,
              timestamp: new Date().toISOString(),
              taskType: opts.log.taskType,
              pageId: opts.log.pageId,
              promptName: opts.log.promptName,
              sectionIndex: opts.log.sectionIndex,
              correlationId: opts.log.correlationId,
              modelId,
              cacheHit: false,
              success: false,
              errorCount: allErrors.length,
              attempt,
              durationMs: Date.now() - t0,
              usage:
                totalUsage.inputTokens > 0 || totalUsage.outputTokens > 0
                  ? totalUsage
                  : undefined,
              validationErrors: allErrors,
              messages: sanitizeMessages(
                buildLogMessages(system, currentMessages, null)
              ),
            })
          }
          throw err
        }
      }

      throw new Error(
        `Failed after ${maxRetries + 1} attempts. Errors:\n${allErrors.join("\n")}`
      )
    },
  }
}

function resolveObjectMode(
  modelId: string,
  requestedMode: GenerateObjectOptions["mode"],
): GenerateObjectOptions["mode"] {
  const provider = modelId.includes(":") ? modelId.slice(0, modelId.indexOf(":")) : "openai"
  // The AI SDK's Anthropic provider does not implement JSON-mode object
  // generation. Tool mode provides schema-constrained objects for Claude and
  // also supports the recursive schemas for which callers request JSON mode.
  if (provider === "anthropic" && requestedMode === "json") return "tool"
  return requestedMode
}

function resolveModel(
  modelId: string,
  credentials?: LLMProviderCredentials,
  options: { structuredOutputs?: boolean } = {}
): LanguageModel {
  const colonIdx = modelId.indexOf(":")
  const provider = colonIdx >= 0 ? modelId.slice(0, colonIdx) : "openai"
  const model = colonIdx >= 0 ? modelId.slice(colonIdx + 1) : modelId

  switch (provider) {
    case "openai": {
      const providerClient = credentials?.openaiApiKey
        ? createOpenAI({ apiKey: credentials.openaiApiKey })
        : openai
      return providerClient(
        model,
        options.structuredOutputs !== undefined
          ? { structuredOutputs: options.structuredOutputs }
          : undefined,
      )
    }
    case "anthropic": {
      const providerClient = credentials?.anthropicApiKey
        ? createAnthropic({ apiKey: credentials.anthropicApiKey })
        : anthropic
      return providerClient(model)
    }
    case "google": {
      const providerClient = credentials?.googleApiKey
        ? createGoogleGenerativeAI({ apiKey: credentials.googleApiKey })
        : google
      return providerClient(model)
    }
    case "custom": {
      const baseURL = credentials?.customBaseUrl ?? process.env.CUSTOM_OPENAI_BASE_URL
      const apiKey = credentials?.customApiKey ?? process.env.CUSTOM_OPENAI_API_KEY
      if (!baseURL) throw new Error("Custom provider requires CUSTOM_OPENAI_BASE_URL to be set (configure in Settings → Custom)")
      const custom = createOpenAI({ baseURL, apiKey: apiKey || "dummy" })
      return custom(model, options.structuredOutputs !== undefined ? { structuredOutputs: options.structuredOutputs } : undefined)
    }
    default:
      throw new Error(`Unsupported LLM provider: ${provider}`)
  }
}

function formatError(err: unknown): string {
  if (err instanceof DOMException && err.name === "TimeoutError") {
    return `Timeout: ${err.message}`
  }
  if (APICallError.isInstance(err)) {
    const status = err.statusCode ? `HTTP ${err.statusCode}` : "no status"
    return `${status}: ${err.message}`
  }
  if (NoObjectGeneratedError.isInstance(err)) {
    const parts = [err.message]
    if (err.finishReason) parts.push(`finishReason=${err.finishReason}`)
    if (err.cause) parts.push(`cause=${err.cause instanceof Error ? err.cause.message : String(err.cause)}`)
    if (err.text) parts.push(`response=${err.text}`)
    return parts.join(" | ")
  }
  if (err instanceof Error) return err.message
  return String(err)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function backoffDelay(attempt: number): number {
  const base = Math.min(1000 * 2 ** attempt, 60_000)
  return base + Math.floor(Math.random() * base * 0.1)
}

async function callLLM<T>(
  model: LanguageModel,
  opts: GenerateObjectOptions,
  system: string | undefined,
  messages: Message[],
  mode: GenerateObjectOptions["mode"],
): Promise<{ object: T; usage: TokenUsage }> {
  const coreMessages = convertMessages(messages)
  const generateOpts: Record<string, unknown> = {
    model,
    schema: opts.schema,
    system,
    messages: coreMessages,
    maxRetries: 0,
    abortSignal: AbortSignal.timeout(opts.timeoutMs ?? 90_000),
  }
  if (mode) {
    generateOpts.mode = mode
  }
  if (opts.maxTokens) {
    generateOpts.maxTokens = opts.maxTokens
  }
  if (opts.temperature !== undefined) {
    generateOpts.temperature = opts.temperature
  }
  const generated = await (generateObject as Function)(
    generateOpts
  ) as Awaited<ReturnType<typeof generateObject>>

  return {
    object: generated.object as T,
    usage: {
      inputTokens: generated.usage.promptTokens,
      outputTokens: generated.usage.completionTokens,
    },
  }
}

function convertMessages(messages: Message[]): CoreMessage[] {
  const result: CoreMessage[] = []
  for (const m of messages) {
    if (m.role === "system") continue

    if (typeof m.content === "string") {
      if (m.role === "user") {
        result.push({ role: "user", content: m.content })
      } else {
        result.push({ role: "assistant", content: m.content })
      }
      continue
    }

    if (m.role === "user") {
      const parts = m.content.map((p) => {
        if (p.type === "text") {
          return { type: "text" as const, text: p.text }
        }
        return { type: "image" as const, image: p.image }
      })
      result.push({ role: "user", content: parts })
    } else {
      // Assistant messages only support text parts in the AI SDK
      const textParts = m.content
        .filter((p) => p.type === "text")
        .map((p) => ({ type: "text" as const, text: p.text }))
      result.push({ role: "assistant", content: textParts })
    }
  }
  return result
}

function buildLogMessages(
  system: string | undefined,
  messages: Message[],
  finalResult: unknown | null
): Message[] {
  const log: Message[] = []
  if (system) {
    log.push({ role: "system", content: system })
  }
  log.push(...messages)
  if (finalResult !== null) {
    log.push({
      role: "assistant",
      content: JSON.stringify(finalResult, null, 2),
    })
  }
  return log
}

function appendValidationFeedback(
  messages: Message[],
  failedResult: unknown,
  errors: string[]
): Message[] {
  return [
    ...messages,
    {
      role: "assistant" as const,
      content: JSON.stringify(failedResult, null, 2),
    },
    {
      role: "user" as const,
      content:
        "Your previous response failed validation with these errors:\n" +
        errors.map((e) => `- ${e}`).join("\n") +
        "\n\nPlease fix these issues and try again.",
    },
  ]
}
