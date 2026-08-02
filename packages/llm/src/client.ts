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
  ValidationResult,
} from "./types.js"
import type { PromptEngine } from "./prompt.js"
import type { RateLimiter } from "./rate-limiter.js"
import { computeHash, readCache, writeCache, bustCache } from "./cache.js"
import { sanitizeMessages, type LlmLogEntry } from "./log.js"
import { createLogger, type LogLevel } from "./logger.js"
import { ollamaOpenAIBaseUrl, resolveOllamaModelName } from "./ollama.js"

export interface LLMProviderCredentials {
  openaiApiKey?: string
  anthropicApiKey?: string
  googleApiKey?: string
  customBaseUrl?: string
  customApiKey?: string
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
  /** External cancellation signal applied to every call this model makes.
   *  Combined with each request's internal timeout; when it aborts, in-flight
   *  calls abort and the retry loop stops (a run cancel, not a timeout). */
  signal?: AbortSignal
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
  const { modelId, cacheDir, promptEngine, onLog, rateLimiter, credentials, logLevel, signal: modelSignal } = options
  const log = createLogger(logLevel)

  return {
    async renderPrompt(
      name: string,
      context: Record<string, unknown>,
    ): Promise<Message[]> {
      if (!promptEngine) {
        throw new Error("promptEngine required for renderPrompt")
      }
      return promptEngine.renderPrompt(name, context, { modelId })
    },

    async generateObject<T>(
      opts: GenerateObjectOptions
    ): Promise<GenerateObjectResult<T>> {
      // Resolve prompt to system + messages if needed
      let system = opts.system
      let messages = opts.messages ?? []
      let resolvedPromptName = opts.prompt

      const context = opts.context ?? {}
      // Per-call signal wins over the model-level signal; either one cancels.
      const externalSignal = opts.signal ?? modelSignal

      if (opts.prompt) {
        if (!promptEngine) {
          throw new Error("promptEngine required when using prompt option")
        }
        resolvedPromptName = promptEngine.resolvePrompt(opts.prompt, { modelId }).resolvedName
        const allMessages = await promptEngine.renderPrompt(
          opts.prompt,
          context,
          { modelId },
        )
        const systemMsg = allMessages.find((m) => m.role === "system")
        system =
          typeof systemMsg?.content === "string"
            ? systemMsg.content
            : undefined
        messages = allMessages.filter((m) => m.role !== "system")
      }

      const maxRetries = opts.maxRetries ?? 0
      const t0 = Date.now()
      const requestId = randomUUID()

      let currentMessages = messages
      let allErrors: string[] = []
      let lastCacheHit = false
      let totalUsage: TokenUsage = { inputTokens: 0, outputTokens: 0 }
      let canonicalHash: string | undefined

      const label = opts.log
        ? `${opts.log.taskType}${opts.log.pageId ? ` ${opts.log.pageId}` : ""}`
        : modelId
      const logPromptName = resolvedPromptName ?? opts.log?.promptName
      const requestedPromptName =
        opts.log?.promptName && logPromptName && opts.log.promptName !== logPromptName
          ? opts.log.promptName
          : opts.log?.requestedPromptName

      const effectiveMode = modelId.startsWith("ollama:")
        ? opts.mode ?? "json"
        : opts.mode

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const hash = computeHash({
          cacheVersion: 2,
          modelId,
          providerIdentity: providerCacheIdentity(modelId, credentials),
          mode: effectiveMode,
          system,
          messages: currentMessages,
          schema: opts.schema,
          temperature: opts.temperature,
          maxTokens: opts.maxTokens,
        })
        canonicalHash ??= hash

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
                  structuredOutputs: effectiveMode === "json" ? false : undefined,
                }),
                { ...opts, mode: effectiveMode },
                system,
                currentMessages,
                externalSignal,
                modelId,
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
                structuredOutputs: effectiveMode === "json" ? false : undefined,
              }),
              { ...opts, mode: effectiveMode },
              system,
              currentMessages,
              externalSignal,
              modelId,
            )
            result = generated.object
            totalUsage.inputTokens += generated.usage.inputTokens
            totalUsage.outputTokens += generated.usage.outputTokens
            lastCacheHit = false
          }

          // The AI SDK validates normal responses, but Ollama recovery can
          // return the raw JSON candidate after the SDK rejects it. Re-run the
          // schema here so custom validators never receive a malformed shape.
          const schemaCheck = validateAgainstSchema(opts.schema, result)
          if (schemaCheck?.valid && schemaCheck.cleaned !== undefined) {
            result = schemaCheck.cleaned as T
          }
          const check = schemaCheck && !schemaCheck.valid
            ? schemaCheck
            : opts.validate?.(result, context)
          if (check) {
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
                  promptName: logPromptName ?? opts.log.promptName,
                  requestedPromptName,
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

          // Retry feedback changes the request hash. Persist the accepted,
          // cleaned result under the original request too, otherwise every
          // future run repeats the same corrective retry.
          if (cacheDir && !lastCacheHit && canonicalHash) {
            writeCache(cacheDir, canonicalHash, result)
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
              promptName: logPromptName ?? opts.log.promptName,
              requestedPromptName,
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

          // A deliberate external cancel never retries — detected by the signal,
          // not the error name (the SDK may wrap the AbortError). The internal
          // timeout also aborts the call but leaves the signal intact, so those
          // keep retrying as before.
          if (externalSignal?.aborted) {
            log.error(`[LLM] ${label} | cancelled | ${errMsg}`)
            throw err
          }

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
                promptName: logPromptName ?? opts.log.promptName,
                requestedPromptName,
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
            await sleep(delayMs, externalSignal)
            // Cancelled during backoff — stop instead of firing one more attempt.
            if (externalSignal?.aborted) {
              log.error(`[LLM] ${label} | cancelled during backoff`)
              throw err
            }
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
              promptName: logPromptName ?? opts.log.promptName,
              requestedPromptName,
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

function validateAgainstSchema(
  schema: unknown,
  value: unknown,
): ValidationResult | undefined {
  if (
    typeof schema !== "object" ||
    schema === null ||
    !("safeParse" in schema) ||
    typeof schema.safeParse !== "function"
  ) {
    return undefined
  }

  const parsed = schema.safeParse(value) as {
    success: boolean
    data?: unknown
    error?: { issues?: Array<{ path?: PropertyKey[]; message?: string }> }
  }
  if (parsed.success) {
    return { valid: true, errors: [], cleaned: parsed.data }
  }

  const issues = parsed.error?.issues ?? []
  const errors = issues.length > 0
    ? issues.map((issue) => {
        const path = issue.path?.map(String).join(".")
        return `Schema validation failed${path ? ` at ${path}` : ""}: ${issue.message ?? "invalid value"}`
      })
    : ["Schema validation failed: invalid response shape"]
  return { valid: false, errors }
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
    case "ollama": {
      const ollama = createOpenAI({
        baseURL: ollamaOpenAIBaseUrl(),
        apiKey: "ollama",
      })
      return ollama(
        resolveOllamaModelName(model),
        options.structuredOutputs !== undefined
          ? { structuredOutputs: options.structuredOutputs }
          : undefined,
      )
    }
    default:
      throw new Error(`Unsupported LLM provider: ${provider}`)
  }
}

function providerCacheIdentity(
  modelId: string,
  credentials?: LLMProviderCredentials,
): string {
  const provider = modelId.includes(":") ? modelId.slice(0, modelId.indexOf(":")) : "openai"
  if (provider === "ollama") return ollamaOpenAIBaseUrl()
  if (provider === "custom") {
    return credentials?.customBaseUrl ?? process.env.CUSTOM_OPENAI_BASE_URL ?? "custom:unconfigured"
  }
  return provider
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

/** Sleep that resolves early when `signal` aborts, so a cancel during backoff
 *  doesn't have to wait out the full delay (which can reach ~66s). */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve()
      return
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      resolve()
    }
    signal?.addEventListener("abort", onAbort, { once: true })
  })
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
  externalSignal?: AbortSignal,
  modelId?: string,
): Promise<{ object: T; usage: TokenUsage }> {
  const coreMessages = convertMessages(messages)
  // Combine the internal request timeout with the caller's cancellation signal.
  // Requires Node 20.3+ (see the "engines" field). The timeout rejects with a
  // TimeoutError (still a retryable failure); the external signal aborts with an
  // AbortError (a deliberate cancel — the retry loop stops on it).
  const timeoutSignal = AbortSignal.timeout(opts.timeoutMs ?? 90_000)
  const abortSignal = externalSignal
    ? AbortSignal.any([timeoutSignal, externalSignal])
    : timeoutSignal
  const generateOpts: Record<string, unknown> = {
    model,
    schema: opts.schema,
    system,
    messages: coreMessages,
    maxRetries: 0,
    abortSignal,
  }
  if (opts.mode) {
    generateOpts.mode = opts.mode
  }
  if (opts.maxTokens) {
    generateOpts.maxTokens = opts.maxTokens
  }
  if (opts.temperature !== undefined) {
    generateOpts.temperature = opts.temperature
  }
  if (modelId?.startsWith("ollama:")) {
    generateOpts.providerOptions = {
      openai: { reasoningEffort: "none" },
    }
  }
  const invoke = () => (generateObject as Function)(generateOpts) as Promise<Awaited<ReturnType<typeof generateObject>>>
  let generated: Awaited<ReturnType<typeof generateObject>>
  try {
    generated = modelId?.startsWith("ollama:")
      ? await withOllamaSlot(invoke, externalSignal)
      : await invoke()
  } catch (error) {
    // Ollama models sometimes echo the JSON schema into an otherwise usable
    // JSON response. The AI SDK rejects it before our domain validator can
    // provide precise retry feedback. Recover the raw object only when a
    // caller supplied that validator; it will accept, clean, or reject it.
    if (
      modelId?.startsWith("ollama:") &&
      opts.validate &&
      NoObjectGeneratedError.isInstance(error) &&
      error.text
    ) {
      const candidate = parseJSONCandidate(error.text)
      if (candidate !== undefined) {
        return {
          object: candidate as T,
          usage: { inputTokens: 0, outputTokens: 0 },
        }
      }
    }
    throw error
  }

  return {
    object: generated.object as T,
    usage: {
      inputTokens: generated.usage.promptTokens,
      outputTokens: generated.usage.completionTokens,
    },
  }
}

function parseJSONCandidate(text: string): unknown | undefined {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")
  try {
    return JSON.parse(trimmed)
  } catch {
    const start = trimmed.indexOf("{")
    const end = trimmed.lastIndexOf("}")
    if (start < 0 || end <= start) return undefined
    try {
      return JSON.parse(trimmed.slice(start, end + 1))
    } catch {
      return undefined
    }
  }
}

let ollamaQueueTail: Promise<void> = Promise.resolve()

async function withOllamaSlot<T>(task: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  const previous = ollamaQueueTail
  let release!: () => void
  ollamaQueueTail = new Promise<void>((resolve) => { release = resolve })
  await previous
  try {
    if (signal?.aborted) throw new DOMException("The operation was aborted", "AbortError")
    return await task()
  } finally {
    release()
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
        return {
          type: "image" as const,
          image: p.image,
          ...(p.mimeType ? { mimeType: p.mimeType } : {}),
        }
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
