import { randomUUID } from "node:crypto"
import type {
  ProviderManifest,
  StructuredOutputStrategy,
  StructuredTextCapabilities,
} from "@adt/types"
import type {
  LLMModel,
  GenerateObjectOptions,
  GenerateObjectResult,
  Message,
  TokenUsage,
} from "./types.js"
import type { PromptEngine } from "./prompt.js"
import type { RateLimiter } from "./rate-limiter.js"
import {
  computeHash,
  computeCacheKeyV2,
  isLegacyCacheReadable,
  readCache,
  writeCache,
  bustCache,
  assertCacheReadable,
} from "./cache.js"
import { sanitizeMessages, type LlmLogEntry } from "./log.js"
import { createLogger, type LogLevel } from "./logger.js"
import {
  boundedRetryDelay,
  classifyLLMError,
  safeLLMErrorMessage,
  LLMCallError,
  LLMValidationError,
} from "./errors.js"
import { NoObjectGeneratedError } from "ai"
import { asZodLike } from "./providers/shared/json-schema.js"
import { resolveProviderCredentials, type ResolvedCredentials } from "./credentials.js"
import { knownTokenUsage } from "./token-usage.js"
import {
  mergeResolvedCredentials,
  toResolvedCredentials,
  type LLMProviderCredentials,
} from "./legacy-credentials.js"
import { getDefaultProviderRegistry } from "./providers/index.js"
import type { ProviderRegistry, ResolvedBackend } from "./registry.js"
import type { StructuredTextBackend } from "./ports/index.js"

export type { LLMProviderCredentials }

function resolveEffectiveTimeoutMs(
  manifest: ProviderManifest,
  requestedTimeoutMs: number | undefined,
): number | undefined {
  if (manifest.minimumRequestTimeoutMs === undefined) return requestedTimeoutMs
  return Math.max(requestedTimeoutMs ?? 0, manifest.minimumRequestTimeoutMs)
}

export interface CreateLLMModelOptions {
  modelId: string // "openai:gpt-5.4" format
  cacheDir?: string
  /** Bypass reads while publishing only validated output under ordinary keys. */
  forceFresh?: boolean
  /** Host publication may stage validated cache writes until its output commits. */
  writeCache?: (cacheDir: string, hash: string, result: unknown) => void
  promptEngine?: PromptEngine
  onLog?: (entry: LlmLogEntry) => void
  rateLimiter?: RateLimiter
  credentials?: LLMProviderCredentials
  /** Manifest-driven credentials; merged over the legacy `credentials` struct. */
  providerCredentials?: ResolvedCredentials
  registry?: ProviderRegistry
  /** Console log level. Defaults to "info" (show all). Use "silent" to suppress. */
  logLevel?: LogLevel
  /** External cancellation signal applied to every call this model makes.
   *  Combined with each request's internal timeout; when it aborts, in-flight
   *  calls abort and the retry loop stops (a run cancel, not a timeout). */
  signal?: AbortSignal
}

/**
 * Compatibility facade over the provider registry: disk cache, validation
 * retries, inspectable logging and optional prompt rendering.
 */
export function createLLMModel(options: CreateLLMModelOptions): LLMModel {
  const {
    modelId,
    cacheDir,
    promptEngine,
    onLog,
    rateLimiter,
    credentials,
    logLevel,
    signal: modelSignal,
  } = options
  const log = createLogger(logLevel)
  const registry = options.registry ?? getDefaultProviderRegistry()
  const providerCredentials = mergeResolvedCredentials(
    toResolvedCredentials(credentials),
    options.providerCredentials,
  )

  return {
    async renderPrompt(name: string, context: Record<string, unknown>): Promise<Message[]> {
      if (!promptEngine) {
        throw new Error("promptEngine required for renderPrompt")
      }
      return promptEngine.renderPrompt(name, context, { modelId })
    },

    async generateObject<T>(opts: GenerateObjectOptions): Promise<GenerateObjectResult<T>> {
      // Resolve prompt to system + messages if needed
      let system = opts.system
      let messages = opts.messages ?? []
      let resolvedPromptName = opts.prompt

      const context = opts.context ?? {}
      const forceFresh = opts.forceFresh ?? options.forceFresh ?? false
      if (cacheDir) assertCacheReadable(cacheDir)
      // Either the per-call or model-level signal cancels this request.
      const signals = [opts.signal, modelSignal].filter((s): s is AbortSignal => !!s)
      const externalSignal = signals.length > 1 ? AbortSignal.any(signals) : signals[0]
      externalSignal?.throwIfAborted()

      if (opts.prompt) {
        if (!promptEngine) {
          throw new Error("promptEngine required when using prompt option")
        }
        resolvedPromptName = promptEngine.resolvePrompt(opts.prompt, { modelId }).resolvedName
        const allMessages = await promptEngine.renderPrompt(opts.prompt, context, { modelId })
        const systemMsg = allMessages.find((m) => m.role === "system")
        system = typeof systemMsg?.content === "string" ? systemMsg.content : undefined
        messages = allMessages.filter((m) => m.role !== "system")
      }

      const maxRetries = opts.maxRetries ?? 0
      if (!Number.isSafeInteger(maxRetries) || maxRetries < 0) {
        throw new Error("maxRetries must be a non-negative safe integer")
      }
      const t0 = Date.now()
      const requestId = randomUUID()

      let currentMessages = messages
      const totalUsage: TokenUsage = { inputTokens: 0, outputTokens: 0 }
      let totalUsageKnown = true

      const label = opts.log
        ? `${opts.log.taskType}${opts.log.pageId ? ` ${opts.log.pageId}` : ""}`
        : modelId
      const logPromptName = resolvedPromptName ?? opts.log?.promptName
      const requestedPromptName =
        opts.log?.promptName && logPromptName && opts.log.promptName !== logPromptName
          ? opts.log.promptName
          : opts.log?.requestedPromptName

      // Resolve the backend once: the provider, model, fingerprint and effective
      // strategy are identical across retries and must enter the cache key before
      // the first read. A resolution failure is a configuration error, so it is
      // logged once and never retried.
      let resolved: ResolvedBackend<StructuredTextBackend, "structured-text">
      try {
        resolved = registry.resolveStructuredText(modelId, {
          credentials: providerCredentials,
          logLevel,
        })
      } catch (err) {
        const classification = classifyLLMError(err)
        const errMsg = safeLLMErrorMessage(classification)
        log.error(`[LLM] ${label} | error | ${errMsg}`)
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
            providerCall: false,
            ...classification,
            outcome: "failed",
            finalError: true,
            success: false,
            errorCount: 1,
            attempt: 0,
            durationMs: Date.now() - t0,
            validationErrors: [errMsg],
            messages: sanitizeMessages(buildLogMessages(system, messages, null)),
          })
        }
        throw err
      }

      const strategy = selectStrategy(
        resolved.capabilities,
        { recursiveSchema: opts.recursiveSchema, looseSchema: opts.looseSchema },
        opts.mode,
      )
      const supportsTemperature = resolved.capabilities.temperature
      if (opts.temperature !== undefined && !supportsTemperature) {
        log.info(
          `[LLM] ${label} | temperature ignored | ${resolved.qualifiedModelId} does not accept it`,
        )
      }
      const effectiveTemperature = supportsTemperature ? opts.temperature : undefined
      const effectiveTimeoutMs = resolveEffectiveTimeoutMs(
        registry.get(resolved.providerId).manifest,
        opts.timeoutMs,
      )
      const legacyReadable = isLegacyCacheReadable(resolved.fingerprint)

      let providerCalls = 0
      const provider = registry.get(resolved.providerId)
      const effectiveCredentials = resolveProviderCredentials(provider, providerCredentials)
      const secrets = provider.manifest.credentialFields
        .filter((field) => field.kind === "secret")
        .map((field) => effectiveCredentials[field.key])
        .filter((secret): secret is string => !!secret)
      const redact = (message: string): string => {
        let safe = message
        for (const secret of secrets) safe = safe.split(secret).join("[redacted]")
        return safe
      }
      const scrub = (message: string) => redact(message).slice(0, 4096)

      let originalHash: string | undefined
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        externalSignal?.throwIfAborted()
        const attemptStartedAt = Date.now()
        let attemptUsage: TokenUsage | undefined
        let providerCall = false
        let cacheHit = false
        let validated = false
        const hash = computeCacheKeyV2({
          providerId: resolved.providerId,
          modelId: resolved.modelId,
          fingerprint: resolved.fingerprint,
          operation: "structured-text",
          system,
          messages: currentMessages,
          schema: opts.schema,
          structuredOutputStrategy: strategy,
          temperature: effectiveTemperature,
          maxTokens: opts.maxTokens,
        })
        originalHash ??= hash
        const legacyHashes = (
          legacyReadable ? [...new Set([opts.mode, legacyModeForStrategy(strategy)])] : []
        ).map((mode) =>
          computeHash({
            modelId,
            mode,
            system,
            messages: currentMessages,
            schema: opts.schema,
            temperature: opts.temperature,
          }),
        )
        let cachedHash: string | undefined
        const record = (fields: Partial<LlmLogEntry>, output: unknown | null = null) => {
          if (!opts.log || !onLog) return
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
            cacheHit,
            providerCall,
            maxAttempts: maxRetries + 1,
            success: false,
            errorCount: 0,
            attempt,
            durationMs: Date.now() - attemptStartedAt,
            usage: attemptUsage,
            messages: sanitizeMessages(buildLogMessages(system, currentMessages, output)).map(
              (message) => ({
                ...message,
                content: message.content.map((part) =>
                  part.type === "text" ? { ...part, text: redact(part.text) } : part,
                ),
              }),
            ),
            ...fields,
          })
        }
        try {
          let result: T | null = null
          if (cacheDir && !forceFresh) {
            for (const candidate of [hash, ...legacyHashes]) {
              result = readCache<T>(cacheDir, candidate)
              if (result !== null) {
                cachedHash = candidate
                cacheHit = true
                break
              }
            }
          }
          if (!cacheHit) {
            await rateLimiter?.acquire(externalSignal)
            externalSignal?.throwIfAborted()
            providerCall = !resolved.backend.reportsProviderRequests
            if (providerCall) providerCalls++
            const generated = await resolved.backend.generateStructured<T>({
              onProviderRequest: () => { providerCall = true; providerCalls++ },
              system,
              messages: currentMessages,
              schema: opts.schema,
              strategy,
              temperature: effectiveTemperature,
              maxTokens: opts.maxTokens,
              timeoutMs: effectiveTimeoutMs,
              signal: externalSignal,
            })
            attemptUsage = knownTokenUsage(generated.usage)
            if (attemptUsage) {
              totalUsage.inputTokens += attemptUsage.inputTokens
              totalUsage.outputTokens += attemptUsage.outputTokens
            } else totalUsageKnown = false
            result = generated.object
          }
          externalSignal?.throwIfAborted()
          // Disk entries (including legacy ones) must satisfy today's schema too.
          const schema = asZodLike(opts.schema)
          if (schema) {
            const parsed = schema.safeParse(result)
            if (!parsed.success)
              throw new LLMValidationError(
                ["Response must match the required JSON schema."],
                result,
              )
            result = parsed.data as T
          }
          if (opts.validate) {
            const check = opts.validate(result, context)
            if (!check.valid) throw new LLMValidationError(check.errors.map(scrub), result)
            if (check.cleaned !== undefined) result = check.cleaned as T
          }
          externalSignal?.throwIfAborted()
          validated = true
          // Validated fresh output replaces ordinary keys; failed fresh calls retain them.
          if (cacheDir && (!cacheHit || cachedHash !== hash)) {
            (options.writeCache ?? writeCache)(cacheDir, hash, result)
            if (forceFresh && originalHash !== hash) (options.writeCache ?? writeCache)(cacheDir, originalHash, result)
          }
          record({ success: true, outcome: "success" }, result)
          log.info(`[LLM] ${label} | ${cacheHit ? "cached" : "ok"} | ${Date.now() - t0}ms`)
          return {
            object: result as T,
            usage: totalUsageKnown ? totalUsage : undefined,
            cached: cacheHit,
          }
        } catch (err) {
          const classification = externalSignal?.aborted
            ? { errorClass: "cancelled" as const, retryable: false }
            : validated
              ? { errorClass: "non-retryable" as const, retryable: false }
              : classifyLLMError(err)
          const message = safeLLMErrorMessage(classification)
          if (!attemptUsage) {
            const usage =
              err instanceof LLMValidationError
                ? err.usage
                : NoObjectGeneratedError.isInstance(err) && err.usage
                  ? {
                      inputTokens: err.usage.promptTokens,
                      outputTokens: err.usage.completionTokens,
                    }
                  : undefined
            attemptUsage = knownTokenUsage(usage)
            if (attemptUsage) {
              totalUsage.inputTokens += attemptUsage.inputTokens
              totalUsage.outputTokens += attemptUsage.outputTokens
            }
          }
          if (providerCall && !attemptUsage) totalUsageKnown = false
          const validation = classification.errorClass === "model-output"
          if (validation && cacheDir && cachedHash) bustCache(cacheDir, cachedHash)
          const feedback = err instanceof LLMValidationError ? err.feedback.map(scrub) : [message]
          const failedOutput = validation
            ? err instanceof LLMValidationError
              ? err.output
              : NoObjectGeneratedError.isInstance(err)
                ? err.text
                : null
            : null
          const retry = classification.retryable && attempt < maxRetries
          // Validation retries keep their existing immediate feedback behavior.
          const delayMs =
            retry && !validation ? boundedRetryDelay(err, backoffDelay(attempt)) : undefined
          record(
            {
              ...classification,
              errorCount: feedback.length,
              validationErrors: feedback,
              error: validation ? undefined : message,
              finalError: !retry,
              retryDelayMs: delayMs,
              outcome:
                classification.errorClass === "cancelled"
                  ? "cancelled"
                  : retry
                    ? "retrying"
                    : "failed",
            },
            failedOutput ?? null,
          )
          if (validation)
            currentMessages = appendValidationFeedback(
              currentMessages,
              failedOutput ?? null,
              feedback,
              redact,
            )
          if (!retry) throw new LLMCallError(classification, attempt + 1, providerCalls, requestId)
          if (delayMs !== undefined) {
            log.info(`[LLM] ${label} | ${message} | retrying in ${delayMs}ms`)
            await sleep(delayMs, externalSignal)
            if (externalSignal?.aborted) {
              const cancelled = { errorClass: "cancelled" as const, retryable: false }
              // Terminal control record: no request or usage; not another paid attempt.
              providerCall = false
              cacheHit = false
              attemptUsage = undefined
              record({
                ...cancelled,
                finalError: true,
                outcome: "cancelled",
                error: "Request cancelled",
              })
              throw new LLMCallError(cancelled, attempt + 1, providerCalls, requestId)
            }
          }
        }
      }
      throw new Error("Retry budget exhausted")
    },
  }
}

interface StructuredSchemaTraits {
  recursiveSchema?: boolean
  looseSchema?: boolean
}

/**
 * Resolves the effective structured-output strategy from the provider's declared
 * capabilities and the schema's traits. Call sites describe the schema, not a
 * provider peculiarity; the deprecated `mode` remains an explicit override.
 */
function selectStrategy(
  capabilities: StructuredTextCapabilities,
  traits: StructuredSchemaTraits,
  mode: GenerateObjectOptions["mode"],
): StructuredOutputStrategy {
  const supported = capabilities.strategies
  const preferred = supported[0]
  if (!preferred) throw new Error("Provider declares no structured-output strategy")

  // Deprecated override still wins when the provider offers the named strategy.
  const override: StructuredOutputStrategy | undefined =
    mode === "json" ? "json-mode" : mode === "tool" ? "tool-call" : undefined
  if (override && supported.includes(override)) return override

  // A recursive or open-ended schema can't go through a strict native schema
  // unless the provider says its native mode handles them — fall back to the
  // most-preferred non-strict strategy the provider offers.
  const needsNonStrict =
    (traits.recursiveSchema || traits.looseSchema) && !capabilities.recursiveSchemas
  if (needsNonStrict) {
    const nonStrict = supported.find((s) => s !== "native-schema")
    if (nonStrict) return nonStrict
  }

  return preferred
}

/** Maps an effective strategy back to the deprecated `mode` the v1 cache key
 *  recorded, so a legacy dual-read still lands on the original entry. */
function legacyModeForStrategy(strategy: StructuredOutputStrategy): GenerateObjectOptions["mode"] {
  if (strategy === "json-mode") return "json"
  if (strategy === "tool-call") return "tool"
  return undefined
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

function buildLogMessages(
  system: string | undefined,
  messages: Message[],
  finalResult: unknown | null,
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
  errors: string[],
  redact: (message: string) => string,
): Message[] {
  return [
    ...messages,
    {
      role: "assistant" as const,
      content: redact(JSON.stringify(failedResult, null, 2)),
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
