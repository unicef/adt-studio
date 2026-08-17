import { randomUUID } from "node:crypto"
import type { StructuredOutputStrategy, StructuredTextCapabilities } from "@adt/types"
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
} from "./cache.js"
import { sanitizeMessages, type LlmLogEntry } from "./log.js"
import { createLogger, type LogLevel } from "./logger.js"
import { formatProviderError } from "./error-format.js"
import { AiProviderError } from "./ports/errors.js"
import type { ResolvedCredentials } from "./credentials.js"
import {
  mergeResolvedCredentials,
  toResolvedCredentials,
  type LLMProviderCredentials,
} from "./legacy-credentials.js"
import {
  CLAUDE_AGENT_PROVIDER_ID,
  CODEX_PROVIDER_ID,
  getDefaultProviderRegistry,
  OLLAMA_PROVIDER_ID,
} from "./providers/index.js"
import type { ProviderRegistry, ResolvedBackend } from "./registry.js"
import type { StructuredTextBackend } from "./ports/index.js"

export type { LLMProviderCredentials }

const LOCAL_PROVIDER_MIN_TIMEOUT_MS = 600_000
const LOCAL_PROVIDER_IDS = new Set<string>([
  OLLAMA_PROVIDER_ID,
  CLAUDE_AGENT_PROVIDER_ID,
  CODEX_PROVIDER_ID,
])

function resolveEffectiveTimeoutMs(
  providerId: string,
  requestedTimeoutMs: number | undefined,
): number | undefined {
  if (!LOCAL_PROVIDER_IDS.has(providerId)) return requestedTimeoutMs
  return Math.max(requestedTimeoutMs ?? 0, LOCAL_PROVIDER_MIN_TIMEOUT_MS)
}

export interface CreateLLMModelOptions {
  modelId: string // "openai:gpt-5.4" format
  cacheDir?: string
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
  const { modelId, cacheDir, promptEngine, onLog, rateLimiter, credentials, logLevel, signal: modelSignal } = options
  const log = createLogger(logLevel)
  const registry = options.registry ?? getDefaultProviderRegistry()
  const providerCredentials = mergeResolvedCredentials(
    toResolvedCredentials(credentials),
    options.providerCredentials,
  )

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
        const errMsg = formatProviderError(err)
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
        resolved.providerId,
        opts.timeoutMs,
      )
      const legacyReadable = isLegacyCacheReadable(resolved.fingerprint)

      const generate = async (
        current: Message[],
      ): Promise<{ object: T; usage: TokenUsage }> => {
        const generated = await resolved.backend.generateStructured<T>({
          system,
          messages: current,
          schema: opts.schema,
          strategy,
          temperature: effectiveTemperature,
          maxTokens: opts.maxTokens,
          timeoutMs: effectiveTimeoutMs,
          signal: externalSignal,
        })
        return { object: generated.object, usage: generated.usage }
      }

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const attemptStartedAt = Date.now()
        const attemptUsage: TokenUsage = { inputTokens: 0, outputTokens: 0 }
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
        // Reproduce the exact v1 key so a legacy entry from an unambiguous
        // backend still counts as a hit; configurable-origin providers skip it.
        // The v1 key recorded the caller's deprecated `mode` verbatim — omitted
        // when none was passed, even for providers whose default strategy maps
        // to one (e.g. anthropic's tool-call) — so probe the raw value and the
        // strategy's mapping, which differ for migrated call sites.
        const legacyModes = legacyReadable
          ? [...new Set([opts.mode, legacyModeForStrategy(strategy)])]
          : []
        const legacyHashes = legacyModes.map((mode) =>
          computeHash({
            modelId,
            mode,
            system,
            messages: currentMessages,
            schema: opts.schema,
            temperature: opts.temperature,
          }),
        )

        try {
          let result: T

          // Check cache
          if (cacheDir) {
            const cached = readCache<T>(cacheDir, hash)
            let legacyCached: T | null = null
            if (cached === null) {
              for (const legacyHash of legacyHashes) {
                legacyCached = readCache<T>(cacheDir, legacyHash)
                if (legacyCached !== null) break
              }
            }
            if (cached !== null) {
              result = cached
              lastCacheHit = true
            } else if (legacyCached !== null) {
              // Promote the legacy hit into v2 so future reads skip the fallback.
              result = legacyCached
              lastCacheHit = true
              writeCache(cacheDir, hash, result)
            } else {
              if (rateLimiter) await rateLimiter.acquire()
              const generated = await generate(currentMessages)
              result = generated.object
              attemptUsage.inputTokens += generated.usage.inputTokens
              attemptUsage.outputTokens += generated.usage.outputTokens
              totalUsage.inputTokens += generated.usage.inputTokens
              totalUsage.outputTokens += generated.usage.outputTokens
              lastCacheHit = false
              writeCache(cacheDir, hash, result)
            }
          } else {
            if (rateLimiter) await rateLimiter.acquire()
            const generated = await generate(currentMessages)
            result = generated.object
            attemptUsage.inputTokens += generated.usage.inputTokens
            attemptUsage.outputTokens += generated.usage.outputTokens
            totalUsage.inputTokens += generated.usage.inputTokens
            totalUsage.outputTokens += generated.usage.outputTokens
            lastCacheHit = false
          }

          // Validate if validator provided
          if (opts.validate) {
            const check = opts.validate(result, context)
            if (!check.valid) {
              allErrors.push(...check.errors)
              if (cacheDir) {
                bustCache(cacheDir, hash)
                for (const legacyHash of legacyHashes) bustCache(cacheDir, legacyHash)
              }
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
                  errorCount: check.errors.length,
                  attempt,
                  durationMs: Date.now() - attemptStartedAt,
                  usage:
                    attemptUsage.inputTokens > 0 || attemptUsage.outputTokens > 0
                      ? attemptUsage
                      : undefined,
                  validationErrors: check.errors,
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
              promptName: logPromptName ?? opts.log.promptName,
              requestedPromptName,
              sectionIndex: opts.log.sectionIndex,
              correlationId: opts.log.correlationId,
              modelId,
              cacheHit: lastCacheHit,
              success: true,
              errorCount: 0,
              attempt,
              durationMs: Date.now() - attemptStartedAt,
              usage:
                attemptUsage.inputTokens > 0 || attemptUsage.outputTokens > 0
                  ? attemptUsage
                  : undefined,
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
          const errMsg = formatProviderError(err)
          allErrors.push(errMsg)
          if (cacheDir) {
            bustCache(cacheDir, hash)
            for (const legacyHash of legacyHashes) bustCache(cacheDir, legacyHash)
          }

          // A deliberate external cancel never retries — detected by the signal,
          // not the error name (the SDK may wrap the AbortError). The internal
          // timeout also aborts the call but leaves the signal intact, so those
          // keep retrying as before.
          if (externalSignal?.aborted) {
            log.error(`[LLM] ${label} | cancelled | ${errMsg}`)
            throw err
          }

          // Provider/credential/model errors are configuration failures, not
          // transient ones — retrying them only delays the real message.
          if (attempt < maxRetries && !AiProviderError.is(err)) {
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
                errorCount: 1,
                attempt,
                durationMs: Date.now() - attemptStartedAt,
                usage:
                  attemptUsage.inputTokens > 0 || attemptUsage.outputTokens > 0
                    ? attemptUsage
                    : undefined,
                validationErrors: [errMsg],
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
              errorCount: 1,
              attempt,
              durationMs: Date.now() - attemptStartedAt,
              usage:
                attemptUsage.inputTokens > 0 || attemptUsage.outputTokens > 0
                  ? attemptUsage
                  : undefined,
              validationErrors: [errMsg],
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
function legacyModeForStrategy(
  strategy: StructuredOutputStrategy,
): GenerateObjectOptions["mode"] {
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
