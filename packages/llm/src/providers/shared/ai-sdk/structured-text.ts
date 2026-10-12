import { LLMValidationError } from "../../../errors.js"
import { generateObject, generateText, type LanguageModel } from "ai"
import type {
  StructuredTextBackend,
  StructuredTextRequest,
  StructuredTextResult,
} from "../../../ports/index.js"
import { asZodLike, toJsonSchema } from "../json-schema.js"
import { toCoreMessages } from "./messages.js"

export interface AiSdkModelOptions {
  /** Undefined leaves the provider default alone. */
  structuredOutputs?: boolean
}

export type AiSdkModelFactory = (options: AiSdkModelOptions) => LanguageModel

const DEFAULT_TIMEOUT_MS = 90_000

export function createAiSdkStructuredTextBackend(
  createModel: AiSdkModelFactory,
): StructuredTextBackend {
  return {
    async generateStructured<T>(
      request: StructuredTextRequest,
    ): Promise<StructuredTextResult<T>> {
      const abortSignal = buildAbortSignal(request)
      const messages = toCoreMessages(request.messages)

      if (request.strategy === "parse-repair") {
        return generateWithParseRepair<T>(
          createModel({}),
          request,
          messages,
          abortSignal,
        )
      }

      // OpenAI-family models keep emitting `response_format: json_schema,
      // strict: true` unless `structuredOutputs` is turned off, which rejects
      // recursive schemas — so json-mode has to disable it at model level.
      const sdkModel = createModel({
        structuredOutputs:
          request.strategy === "native-schema"
            ? true
            : request.strategy === "json-mode"
              ? false
              : undefined,
      })

      const options: Record<string, unknown> = {
        model: sdkModel,
        schema: request.schema,
        system: request.system,
        messages,
        maxRetries: 0,
        abortSignal,
        mode: sdkMode(request.strategy),
      }
      if (request.maxTokens) options.maxTokens = request.maxTokens
      if (request.temperature !== undefined) options.temperature = request.temperature
      if (request.providerOptions) options.providerOptions = request.providerOptions

      const generated = (await (generateObject as Function)(options)) as Awaited<
        ReturnType<typeof generateObject>
      >

      return {
        object: generated.object as T,
        usage: {
          inputTokens: generated.usage.promptTokens,
          outputTokens: generated.usage.completionTokens,
        },
      }
    },
  }
}

function sdkMode(strategy: StructuredTextRequest["strategy"]): "auto" | "json" | "tool" {
  switch (strategy) {
    case "json-mode":
      return "json"
    case "tool-call":
      return "tool"
    default:
      return "auto"
  }
}

function buildAbortSignal(request: StructuredTextRequest): AbortSignal {
  const timeout = AbortSignal.timeout(request.timeoutMs ?? DEFAULT_TIMEOUT_MS)
  return request.signal ? AbortSignal.any([timeout, request.signal]) : timeout
}

async function generateWithParseRepair<T>(
  model: LanguageModel,
  request: StructuredTextRequest,
  messages: ReturnType<typeof toCoreMessages>,
  abortSignal: AbortSignal,
): Promise<StructuredTextResult<T>> {
  const zod = asZodLike(request.schema)
  const schemaJson = serializeSchema(request.schema)
  const instruction = schemaJson
    ? `Reply with a single JSON object that validates against this JSON Schema. Emit no prose, no explanation and no code fences.\n\n${schemaJson}`
    : "Respond with a single JSON object and nothing else. No markdown fences, no prose."
  const system = request.system ? `${request.system}\n\n${instruction}` : instruction

  // Exactly one SDK request per facade attempt. Repair feedback and budget are
  // owned by createLLMModel, including parse-repair models.
  const generated = await generateText({
    model, system, messages, maxRetries: 0, abortSignal,
    ...(request.maxTokens ? { maxTokens: request.maxTokens } : {}),
    ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
  })
  const usage = {
    inputTokens: generated.usage.promptTokens,
    outputTokens: generated.usage.completionTokens,
  }
  const extracted = extractJsonObject(generated.text)
  if (extracted === null) {
    throw new LLMValidationError(["That was not valid JSON. Return a JSON object only."], generated.text, usage)
  }
  if (!zod) return { object: extracted as T, usage, rawText: generated.text }
  const parsed = zod.safeParse(extracted)
  if (!parsed.success) {
    throw new LLMValidationError([
      schemaJson
        ? `That JSON did not match the required schema. Return corrected JSON only, validating against this JSON Schema.\n\n${schemaJson}`
        : "That JSON did not match the required schema. Return corrected JSON only.",
    ], extracted, usage)
  }
  return { object: parsed.data as T, usage, rawText: generated.text }
}

function serializeSchema(schema: unknown): string | undefined {
  if (!schema || typeof schema !== "object") return undefined
  return JSON.stringify(toJsonSchema(schema, "Structured output"))
}

export function extractJsonObject(text: string): unknown | null {
  const withoutFence = text.replace(/```(?:json)?\s*([\s\S]*?)```/g, "$1").trim()
  const candidates = [withoutFence, text.trim()]

  for (const candidate of candidates) {
    const start = candidate.indexOf("{")
    const end = candidate.lastIndexOf("}")
    if (start < 0 || end <= start) continue
    try {
      return JSON.parse(candidate.slice(start, end + 1))
    } catch {
      continue
    }
  }
  return null
}
