import { generateObject, type LanguageModel, type CoreMessage } from "ai"
import { openai } from "@ai-sdk/openai"
import type {
  LLMModel,
  GenerateObjectOptions,
  GenerateObjectResult,
  Message,
  TokenUsage,
} from "./types.js"
import type { PromptEngine } from "./prompt.js"
import { computeHash, readCache, writeCache, bustCache } from "./cache.js"
import { sanitizeMessages, type LlmLogEntry } from "./log.js"

export interface CreateLLMModelOptions {
  modelId: string // "openai:gpt-4o" format
  cacheDir?: string
  promptEngine?: PromptEngine
  onLog?: (entry: LlmLogEntry) => void
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
  const { modelId, cacheDir, promptEngine, onLog } = options
  const languageModel = resolveModel(modelId)

  return {
    async generateObject<T>(
      opts: GenerateObjectOptions
    ): Promise<GenerateObjectResult<T>> {
      // Resolve prompt to system + messages if needed
      let system = opts.system
      let messages = opts.messages ?? []

      if (opts.prompt) {
        if (!promptEngine) {
          throw new Error("promptEngine required when using prompt option")
        }
        const allMessages = await promptEngine.renderPrompt(
          opts.prompt.name,
          opts.prompt.context
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

      let currentMessages = messages
      let allErrors: string[] = []
      let lastCacheHit = false
      let totalUsage: TokenUsage = { inputTokens: 0, outputTokens: 0 }

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const hash = computeHash({
          modelId,
          system,
          messages: currentMessages,
          schema: opts.schema,
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
              const generated = await callLLM<T>(
                languageModel,
                opts,
                system,
                currentMessages
              )
              result = generated.object
              totalUsage.inputTokens += generated.usage.inputTokens
              totalUsage.outputTokens += generated.usage.outputTokens
              lastCacheHit = false
              writeCache(cacheDir, hash, result)
            }
          } else {
            const generated = await callLLM<T>(
              languageModel,
              opts,
              system,
              currentMessages
            )
            result = generated.object
            totalUsage.inputTokens += generated.usage.inputTokens
            totalUsage.outputTokens += generated.usage.outputTokens
            lastCacheHit = false
          }

          // Validate if validator provided
          if (opts.validate) {
            const check = opts.validate(result)
            if (!check.valid) {
              allErrors.push(...check.errors)
              if (cacheDir) bustCache(cacheDir, hash)
              currentMessages = appendValidationFeedback(
                currentMessages,
                result,
                check.errors
              )
              continue
            }
          }

          // Log and return
          if (opts.log && onLog) {
            onLog({
              timestamp: new Date().toISOString(),
              taskType: opts.log.taskType,
              pageId: opts.log.pageId,
              promptName: opts.log.promptName,
              modelId,
              cacheHit: lastCacheHit,
              attempt,
              durationMs: Date.now() - t0,
              usage:
                totalUsage.inputTokens > 0 || totalUsage.outputTokens > 0
                  ? totalUsage
                  : undefined,
              validationErrors: allErrors.length > 0 ? allErrors : undefined,
              system,
              messages: sanitizeMessages(currentMessages),
            })
          }

          return {
            object: result,
            usage: totalUsage,
            cached: lastCacheHit,
          }
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err)
          allErrors.push(errMsg)
          if (cacheDir) bustCache(cacheDir, hash)

          if (attempt === maxRetries) {
            if (opts.log && onLog) {
              onLog({
                timestamp: new Date().toISOString(),
                taskType: opts.log.taskType,
                pageId: opts.log.pageId,
                promptName: opts.log.promptName,
                modelId,
                cacheHit: false,
                attempt,
                durationMs: Date.now() - t0,
                usage:
                  totalUsage.inputTokens > 0 || totalUsage.outputTokens > 0
                    ? totalUsage
                    : undefined,
                validationErrors: allErrors,
                system,
                messages: sanitizeMessages(currentMessages),
              })
            }
            throw err
          }
        }
      }

      throw new Error(
        `Validation failed after ${maxRetries + 1} attempts. Errors:\n${allErrors.join("\n")}`
      )
    },
  }
}

function resolveModel(modelId: string): LanguageModel {
  const [provider, model] = modelId.includes(":")
    ? modelId.split(":", 2)
    : ["openai", modelId]

  switch (provider) {
    case "openai":
      return openai(model)
    default:
      throw new Error(`Unsupported LLM provider: ${provider}`)
  }
}

async function callLLM<T>(
  model: LanguageModel,
  opts: GenerateObjectOptions,
  system: string | undefined,
  messages: Message[]
): Promise<{ object: T; usage: TokenUsage }> {
  const coreMessages = convertMessages(messages)
  const generateOpts: Record<string, unknown> = {
    model,
    schema: opts.schema,
    system,
    messages: coreMessages,
  }
  if (opts.maxTokens) {
    generateOpts.maxTokens = opts.maxTokens
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
