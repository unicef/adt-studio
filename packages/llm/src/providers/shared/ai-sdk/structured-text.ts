import { generateObject, generateText, type LanguageModel } from "ai"
import type {
  StructuredTextBackend,
  StructuredTextRequest,
  StructuredTextResult,
} from "../../../ports/index.js"
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

interface ZodLike {
  safeParse: (input: unknown) => { success: boolean; data?: unknown; error?: unknown }
}

function asZodLike(schema: unknown): ZodLike | null {
  return schema && typeof (schema as ZodLike).safeParse === "function"
    ? (schema as ZodLike)
    : null
}

async function generateWithParseRepair<T>(
  model: LanguageModel,
  request: StructuredTextRequest,
  messages: ReturnType<typeof toCoreMessages>,
  abortSignal: AbortSignal,
): Promise<StructuredTextResult<T>> {
  const zod = asZodLike(request.schema)
  const instruction =
    "Respond with a single JSON object and nothing else. No markdown fences, no prose."
  const system = request.system ? `${request.system}\n\n${instruction}` : instruction

  let usage = { inputTokens: 0, outputTokens: 0 }
  let conversation = [...messages]

  for (let attempt = 0; attempt < 2; attempt++) {
    const options: Record<string, unknown> = {
      model,
      system,
      messages: conversation,
      maxRetries: 0,
      abortSignal,
    }
    if (request.maxTokens) options.maxTokens = request.maxTokens
    if (request.temperature !== undefined) options.temperature = request.temperature

    const generated = (await (generateText as Function)(options)) as Awaited<
      ReturnType<typeof generateText>
    >
    usage = {
      inputTokens: usage.inputTokens + generated.usage.promptTokens,
      outputTokens: usage.outputTokens + generated.usage.completionTokens,
    }

    const extracted = extractJsonObject(generated.text)
    if (extracted !== null) {
      if (!zod) {
        return { object: extracted as T, usage, rawText: generated.text }
      }
      const parsed = zod.safeParse(extracted)
      if (parsed.success) {
        return { object: parsed.data as T, usage, rawText: generated.text }
      }
      if (attempt === 0) {
        conversation = [
          ...conversation,
          { role: "assistant", content: generated.text },
          {
            role: "user",
            content:
              "That JSON did not match the required schema. Return corrected JSON only.",
          },
        ]
        continue
      }
    } else if (attempt === 0) {
      conversation = [
        ...conversation,
        { role: "assistant", content: generated.text },
        { role: "user", content: "That was not valid JSON. Return a JSON object only." },
      ]
      continue
    }

    throw new Error(
      `Model did not return schema-valid JSON after ${attempt + 1} attempt(s). Response: ${generated.text.slice(0, 400)}`,
    )
  }

  throw new Error("Model did not return schema-valid JSON")
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
