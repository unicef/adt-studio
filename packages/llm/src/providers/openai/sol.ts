import { OpenAiResponse, SolReasoningEffort, type InferenceOptions } from "@adt/types"
import type { BackendContext, AgentBackend, AgentMessage, StructuredTextBackend, StructuredTextRequest } from "../../ports/index.js"
import { AiProviderError } from "../../ports/errors.js"
import { StructuredTextError } from "../../ports/structured-text-backend.js"
import { asZodLike, toJsonSchema } from "../shared/json-schema.js"
import { detectImageMediaType, stripDataUrl } from "../shared/image-media-type.js"
import { extractJsonObject } from "../shared/ai-sdk/structured-text.js"
import { sanitizeMessages } from "../../log.js"

export function isSol(modelId: string): boolean {
  return /^gpt-6\.1-sol(?:-\d{4}-\d{2}-\d{2})?$/.test(modelId)
}

export function solInferenceOptions(providerOptions?: Record<string, unknown>): InferenceOptions {
  const raw = providerOptions?.openai
  const openai = raw && typeof raw === "object" ? raw as Record<string, unknown> : {}
  const effort = openai.reasoningEffort
  const reasoningEffort = SolReasoningEffort.parse(
    effort === undefined || effort === "none" || effort === "minimal" ? "low" : effort,
  )
  // Only supported inference options cross this boundary; no sampling/logprobs.
  return { endpoint: "responses", providerOptions: { openai: { reasoningEffort } } }
}

/**
 * AI SDK 4 / @ai-sdk/openai 1.3 omit GPT-6 reasoning effort and drop opaque
 * reasoning items. Direct Responses requests avoid a cross-provider SDK upgrade.
 * Stateless encrypted output travels in the book's cached agent transcript.
 */
export function createSolBackends(context: BackendContext<{ apiKey: string }>): {
  structured: StructuredTextBackend
  agent: AgentBackend
} {
  const call = async (body: Record<string, unknown>, signal: AbortSignal) => {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Authorization": `Bearer ${context.credentials.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: context.modelId, store: false, include: ["reasoning.encrypted_content"], ...body }),
      signal,
    })
    if (!response.ok) {
      // Never echo arbitrary provider text, which could contain request secrets.
      if ([400, 401, 403, 404].includes(response.status)) {
        throw AiProviderError.unsupportedCapability("openai", context.modality,
          `Responses request rejected (HTTP ${response.status}); verify access to ${context.modelId} and its request settings`, context.modelId)
      }
      throw new Error(`OpenAI Responses ${context.modelId} failed (HTTP ${response.status})`)
    }
    return OpenAiResponse.parse(await response.json())
  }

  const structured: StructuredTextBackend = {
    async generateStructured<T>(request: StructuredTextRequest) {
      const effective = solInferenceOptions(request.providerOptions)
      const params: Record<string, unknown> = { ...effective, strategy: request.strategy }
      const input: unknown[] = request.messages.map((message) => ({
        role: message.role,
        content: typeof message.content === "string" ? message.content : message.content.map((part) =>
          part.type === "text" ? { type: message.role === "assistant" ? "output_text" : "input_text", text: part.text } : {
            type: "input_image", image_url: `data:${detectImageMediaType(part.image)};base64,${stripDataUrl(part.image)}`,
          }),
      }))
      const schema = toJsonSchema(request.schema, "Sol structured output")
      const tool = request.strategy === "tool-call"
      const repair = request.strategy === "parse-repair"
      const strict = request.strategy === "native-schema"
      const instructions = [request.system, !strict && !tool
        ? `Return only JSON matching this schema:\n${JSON.stringify(schema)}` : undefined].filter(Boolean).join("\n\n")
      const body: Record<string, unknown> = {
        instructions,
        input,
        reasoning: reasoning(effective),
        max_output_tokens: request.maxTokens,
        ...(tool ? {
          tools: [{ type: "function", name: "structured_output", parameters: schema, strict: false }],
          tool_choice: { type: "function", name: "structured_output" },
          parallel_tool_calls: false,
        } : !repair ? {
          text: { format: strict ? { type: "json_schema", name: "structured_output", strict: true, schema: strictSchema(schema) } : { type: "json_object" } },
        } : {}),
      }
      const usage = { inputTokens: 0, outputTokens: 0 }
      const inferenceAttempts: Record<string, unknown>[] = []
      let remoteCachedInputTokens = 0
      let reasoningTokens = 0
      params.inferenceAttempts = inferenceAttempts
      const signal = signalFor(request, 90_000)
      for (let attempt = 0; attempt < (repair ? 2 : 1); attempt++) {
        const inspected = { request: inspectableRequest(body) }
        inferenceAttempts.push(inspected)
        let response: OpenAiResponse
        try {
          response = await call(body, signal)
        } catch (error) {
          throw new StructuredTextError(error instanceof Error ? error.message : String(error), usage, params, error)
        }
        usage.inputTokens += response.usage.input_tokens
        usage.outputTokens += response.usage.output_tokens // Already includes reasoning tokens.
        remoteCachedInputTokens += response.usage.input_tokens_details?.cached_tokens ?? 0
        reasoningTokens += response.usage.output_tokens_details?.reasoning_tokens ?? 0
        Object.assign(inspected, { response: inspectableRequest(response) })
        Object.assign(params, responseParams(response), { attempts: attempt + 1, remoteCachedInputTokens, reasoningTokens })
        const rawText = tool
          ? response.output.find((item) => item.type === "function_call" && item.name === "structured_output")?.arguments
          : textOf(response)
        const extracted = typeof rawText === "string" ? extractJsonObject(rawText) : null
        const object = strict ? restoreOptionalProperties(extracted, schema) : extracted
        const validator = asZodLike(request.schema)
        const parsed = object !== null ? validator?.safeParse(object) : undefined
        if (response.status === "completed" && object !== null && (!validator || parsed?.success)) {
          return { object: (parsed?.data ?? object) as T, usage, rawText: String(rawText), params }
        }
        if (repair && attempt === 0 && response.status === "completed") {
          input.push(...response.output, { role: "user", content: `The response did not match the schema. Return corrected JSON only.\n${JSON.stringify(schema)}` })
          continue
        }
        throw new StructuredTextError(`OpenAI ${context.modelId} did not return schema-valid JSON (${response.status})`, usage, params)
      }
      throw new StructuredTextError(`OpenAI ${context.modelId} JSON repair failed`, usage, params)
    },
  }

  const agent: AgentBackend = {
    async generateTurn(request) {
      const effective = solInferenceOptions(request.providerOptions)
      const body = {
        instructions: request.system,
        input: agentInput(request.messages),
        reasoning: reasoning(effective),
        max_output_tokens: request.maxTokens,
        tools: request.tools.map((tool) => ({ type: "function", name: tool.name, description: tool.description,
          parameters: toJsonSchema(tool.parameters, `Agent tool ${tool.name}`), strict: false })),
      }
      let response: OpenAiResponse
      try {
        response = await call(body, signalFor(request, 5 * 60_000))
      } catch (error) {
        throw new StructuredTextError(error instanceof Error ? error.message : String(error),
          { inputTokens: 0, outputTokens: 0 }, { ...effective, request: inspectableRequest(body) }, error)
      }
      const usage = { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens }
      const params = { ...effective, ...responseParams(response), request: inspectableRequest(body), response: inspectableRequest(response) }
      if (response.status !== "completed") {
        throw new StructuredTextError(`OpenAI ${context.modelId} agent response ${response.status}`, usage, params)
      }
      const toolCalls = response.output.filter((item) => item.type === "function_call").map((item) => {
        if (typeof item.call_id !== "string" || typeof item.name !== "string" || typeof item.arguments !== "string") {
          throw new StructuredTextError("OpenAI returned an invalid function call", usage, params)
        }
        let args: unknown
        try { args = JSON.parse(item.arguments) } catch {
          throw new StructuredTextError("OpenAI returned invalid function arguments", usage, params)
        }
        const definition = request.tools.find((tool) => tool.name === item.name)
        const parsed = asZodLike(definition?.parameters)?.safeParse(args)
        if (parsed && !parsed.success) {
          throw new StructuredTextError(`OpenAI returned arguments outside the ${item.name} tool schema`, usage, params)
        }
        return { id: item.call_id, toolName: item.name, args: parsed?.data ?? args }
      })
      return { text: textOf(response), toolCalls, usage, params,
        finishReason: toolCalls.length ? "tool-calls" : "stop", providerContinuation: response.output }
    },
  }
  return { structured, agent }
}

function reasoning(effective: InferenceOptions) {
  const openai = effective.providerOptions?.openai as { reasoningEffort: string }
  return { effort: openai.reasoningEffort }
}

function signalFor(request: { timeoutMs?: number; signal?: AbortSignal }, fallback: number): AbortSignal {
  const timeout = AbortSignal.timeout(request.timeoutMs ?? fallback)
  return request.signal ? AbortSignal.any([timeout, request.signal]) : timeout
}

function textOf(response: OpenAiResponse): string {
  return response.output.flatMap((item) => item.type === "message" && Array.isArray(item.content)
    ? item.content.flatMap((part: Record<string, unknown>) => part.type === "output_text" && typeof part.text === "string" ? [part.text] : []) : []).join("")
}

function responseParams(response: OpenAiResponse): Record<string, unknown> {
  return { returnedModel: response.model, remoteCachedInputTokens: response.usage.input_tokens_details?.cached_tokens,
    reasoningTokens: response.usage.output_tokens_details?.reasoning_tokens }
}

function agentInput(messages: AgentMessage[]): unknown[] {
  return messages.flatMap((message): unknown[] => {
    if (message.role === "user") return [{ role: "user", content: message.content }]
    if (message.role === "assistant") return message.providerContinuation ?? [
      ...(message.text ? [{ role: "assistant", content: [{ type: "output_text", text: message.text }] }] : []),
      ...message.toolCalls.map((call) => ({ type: "function_call", call_id: call.id, name: call.toolName, arguments: JSON.stringify(call.args) })),
    ]
    return message.results.map((result) => ({ type: "function_call_output", call_id: result.id, output: JSON.stringify(result.result) }))
  })
}

/** Strict schemas require every property; optional values become nullable. */
function strictSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const result = { ...schema }
  for (const key of ["items", "$defs", "definitions", "anyOf", "oneOf", "allOf"]) {
    const value = result[key]
    if (Array.isArray(value)) result[key] = value.map((entry) => strictSchema(entry))
    else if (value && typeof value === "object") result[key] = key === "$defs" || key === "definitions"
      ? Object.fromEntries(Object.entries(value).map(([name, entry]) => [name, strictSchema(entry)]))
      : strictSchema(value as Record<string, unknown>)
  }
  if (result.properties && typeof result.properties === "object") {
    const required = Array.isArray(result.required) ? result.required : []
    result.properties = Object.fromEntries(Object.entries(result.properties).map(([key, value]) => [key,
      required.includes(key) ? strictSchema(value) : { anyOf: [strictSchema(value), { type: "null" }] },
    ]))
    result.required = Object.keys(result.properties as object)
    result.additionalProperties = false
  }
  return result
}

/** Reverse nullable optional fields introduced solely for the strict wire schema. */
function restoreOptionalProperties(value: unknown, schema: Record<string, unknown>): unknown {
  if (Array.isArray(value) && schema.items && typeof schema.items === "object") {
    return value.map((entry) => restoreOptionalProperties(entry, schema.items as Record<string, unknown>))
  }
  if (!value || typeof value !== "object" || !schema.properties || typeof schema.properties !== "object") return value
  const properties = schema.properties as Record<string, Record<string, unknown>>
  const required = Array.isArray(schema.required) ? schema.required : []
  return Object.fromEntries(Object.entries(value).flatMap(([key, entry]) => {
    const property = properties[key]
    if (!property) return [[key, entry]]
    if (entry === null && !required.includes(key) && !allowsNull(property)) return []
    return [[key, restoreOptionalProperties(entry, property)]]
  }))
}

function allowsNull(schema: Record<string, unknown>): boolean {
  if (schema.type === "null" || Array.isArray(schema.type) && schema.type.includes("null")) return true
  return [schema.anyOf, schema.oneOf].some((variants) => Array.isArray(variants) && variants.some(allowsNull))
}

/** Inspect actual requests and repair turns without copying image bytes into logs. */
function inspectableRequest(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value, (key, entry: unknown) => {
    if (key === "encrypted_content") return "[encrypted reasoning present]"
    if (key === "image_url" && typeof entry === "string" && entry.startsWith("data:")) {
      return sanitizeMessages([{ role: "user", content: [{ type: "image", image: stripDataUrl(entry) }] }])[0].content[0]
    }
    return entry
  }))
}
