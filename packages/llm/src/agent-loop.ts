import { randomUUID } from "node:crypto"
import { computeCacheHash, readCache, writeCache } from "./cache.js"
import { formatProviderError } from "./error-format.js"
import { createLogger, type LogLevel } from "./logger.js"
import type { LlmLogEntry, LlmLogMessage } from "./log.js"
import type { ResolvedCredentials } from "./credentials.js"
import { getDefaultProviderRegistry } from "./providers/index.js"
import { toJsonSchema } from "./providers/shared/json-schema.js"
import type { ProviderRegistry } from "./registry.js"
import type {
  AgentMessage,
  AgentRunResult,
  AgentToolCall,
  AgentToolDefinition,
  AgentToolResult,
  AgentToolSet,
  AgentTurn,
  AgentTurnResponse,
} from "./ports/index.js"

const DEFAULT_MAX_STEPS = 20
const AGENT_CACHE_VERSION = 2

export interface AgentLogContext {
  taskType: string
  promptName: string
  pageId?: string
  correlationId?: string
}

export interface RunAgentLoopOptions {
  modelId: string
  system: string
  prompt: string
  tools: AgentToolSet
  /** Max inference turns. Default 20. */
  maxSteps?: number
  temperature?: number
  maxTokens?: number
  /** Per-turn timeout. */
  timeoutMs?: number
  signal?: AbortSignal
  registry?: ProviderRegistry
  credentials?: ResolvedCredentials
  /** Enables per-turn inference caching. Tool executions are never cached. */
  cacheDir?: string
  onLog?: (entry: LlmLogEntry) => void
  log?: AgentLogContext
  onTurn?: (turn: AgentTurn) => void
  logLevel?: LogLevel
}

/**
 * ADT owns the loop so each inference turn is independently cacheable and
 * inspectable. Tool executions stay outside the cache: they are effects, and
 * replaying a cached model response must still re-run them.
 */
export async function runAgentLoop(
  options: RunAgentLoopOptions,
): Promise<AgentRunResult> {
  const log = createLogger(options.logLevel)
  const registry = options.registry ?? getDefaultProviderRegistry()
  const resolved = registry.resolveAgent(options.modelId, {
    credentials: options.credentials,
    logLevel: options.logLevel,
  })

  const toolDefinitions: AgentToolDefinition[] = Object.entries(options.tools).map(
    ([name, tool]) => ({
      name,
      description: tool.description,
      parameters: tool.parameters,
    }),
  )
  const cacheToolDefinitions = toolDefinitions.map((tool) => ({
    ...tool,
    parameters: toJsonSchema(tool.parameters, `Agent tool "${tool.name}"`),
  }))

  const maxSteps = options.maxSteps ?? DEFAULT_MAX_STEPS
  const correlationId = options.log?.correlationId ?? randomUUID()
  const label = options.log?.taskType ?? resolved.qualifiedModelId

  const messages: AgentMessage[] = [{ role: "user", content: options.prompt }]
  const turns: AgentTurn[] = []
  const usage = { inputTokens: 0, outputTokens: 0 }
  let text = ""
  let finishReason = "unknown"

  for (let index = 0; index < maxSteps; index++) {
    const hash = computeCacheHash({
      kind: "agent-turn",
      version: AGENT_CACHE_VERSION,
      providerId: resolved.providerId,
      modelId: resolved.modelId,
      fingerprint: resolved.fingerprint,
      system: options.system,
      messages,
      tools: cacheToolDefinitions,
      temperature: options.temperature,
      maxTokens: options.maxTokens,
    })

    const t0 = Date.now()
    const cached = options.cacheDir
      ? readCache<AgentTurnResponse>(options.cacheDir, hash)
      : null

    let response: AgentTurnResponse
    try {
      response =
        cached ??
        (await resolved.backend.generateTurn({
          system: options.system,
          messages,
          tools: toolDefinitions,
          temperature: options.temperature,
          maxTokens: options.maxTokens,
          timeoutMs: options.timeoutMs,
          signal: options.signal,
        }))
    } catch (err) {
      const message = formatProviderError(err)
      log.error(`[Agent] ${label} | turn ${index + 1} failed | ${message}`)
      emitLog(options, {
        correlationId,
        modelId: resolved.qualifiedModelId,
        index,
        durationMs: Date.now() - t0,
        cacheHit: false,
        success: false,
        errors: [message],
        messages,
        response: undefined,
        toolResults: [],
      })
      throw err
    }

    if (!cached && options.cacheDir) {
      writeCache(options.cacheDir, hash, response)
    }

    usage.inputTokens += response.usage.inputTokens
    usage.outputTokens += response.usage.outputTokens
    finishReason = response.finishReason
    if (response.text.trim()) text = response.text

    const toolResults: AgentToolResult[] = []
    if (response.toolCalls.length > 0) {
      messages.push({
        role: "assistant",
        text: response.text,
        toolCalls: response.toolCalls,
      })
      for (const call of response.toolCalls) {
        toolResults.push(await executeToolCall(options.tools, call))
      }
      messages.push({ role: "tool", results: toolResults })
    }

    const turn: AgentTurn = {
      index,
      text: response.text,
      toolCalls: response.toolCalls,
      toolResults,
      finishReason: response.finishReason,
      usage: response.usage,
      cacheHit: cached !== null,
    }
    turns.push(turn)

    log.info(
      `[Agent] ${label} | turn ${index + 1}/${maxSteps}${cached ? " | cached" : ""} | ` +
        `${response.toolCalls.length} tool call(s) | ${Date.now() - t0}ms`,
    )
    emitLog(options, {
      correlationId,
      modelId: resolved.qualifiedModelId,
      index,
      durationMs: Date.now() - t0,
      cacheHit: cached !== null,
      success: true,
      errors: toolResults.filter((r) => r.isError).map((r) => String(r.result)),
      messages,
      response,
      toolResults,
    })

    try {
      options.onTurn?.(turn)
    } catch {
      // never let an observer error break the agent loop
    }

    if (response.toolCalls.length === 0) {
      return { text, stepCount: turns.length, usage, finishReason, turns }
    }
  }

  return { text, stepCount: turns.length, usage, finishReason: "max-steps", turns }
}

async function executeToolCall(
  tools: AgentToolSet,
  call: AgentToolCall,
): Promise<AgentToolResult> {
  const tool = tools[call.toolName]
  if (!tool) {
    return {
      id: call.id,
      toolName: call.toolName,
      result: { error: `Unknown tool "${call.toolName}"` },
      isError: true,
    }
  }
  try {
    return { id: call.id, toolName: call.toolName, result: await tool.execute(call.args) }
  } catch (err) {
    return {
      id: call.id,
      toolName: call.toolName,
      result: { error: err instanceof Error ? err.message : String(err) },
      isError: true,
    }
  }
}

interface TurnLogInput {
  correlationId: string
  modelId: string
  index: number
  durationMs: number
  cacheHit: boolean
  success: boolean
  errors: string[]
  messages: AgentMessage[]
  response: AgentTurnResponse | undefined
  toolResults: AgentToolResult[]
}

function emitLog(options: RunAgentLoopOptions, input: TurnLogInput): void {
  if (!options.onLog || !options.log) return
  try {
    options.onLog({
      requestId: randomUUID(),
      timestamp: new Date().toISOString(),
      taskType: options.log.taskType,
      pageId: options.log.pageId,
      promptName: options.log.promptName,
      modelId: input.modelId,
      cacheHit: input.cacheHit,
      success: input.success,
      errorCount: input.errors.length,
      attempt: input.index,
      durationMs: input.durationMs,
      usage: input.response?.usage,
      validationErrors: input.errors.length > 0 ? input.errors : undefined,
      messages: buildTurnLog(options.system, input),
      correlationId: input.correlationId,
    })
  } catch {
    // observability never breaks the path
  }
}

/**
 * The transcript sent for this turn plus the model's own answer, so a reader can
 * reconstruct every prompt, response and tool result without the provider SDK.
 */
function buildTurnLog(system: string, input: TurnLogInput): LlmLogMessage[] {
  const entries: LlmLogMessage[] = [
    { role: "system", content: [{ type: "text", text: system }] },
  ]

  const upToTurn = input.response
    ? input.messages.slice(0, transcriptLength(input))
    : input.messages
  for (const message of upToTurn) {
    entries.push({ role: message.role, content: [{ type: "text", text: describe(message) }] })
  }

  if (input.response) {
    entries.push({
      role: "assistant",
      content: [{ type: "text", text: describeResponse(input.response) }],
    })
    if (input.toolResults.length > 0) {
      entries.push({
        role: "tool",
        content: [{ type: "text", text: describeResults(input.toolResults) }],
      })
    }
  }

  return entries
}

/** The assistant + tool messages this turn produced are logged separately. */
function transcriptLength(input: TurnLogInput): number {
  return input.response && input.response.toolCalls.length > 0
    ? input.messages.length - 2
    : input.messages.length
}

function describe(message: AgentMessage): string {
  if (message.role === "user") return message.content
  if (message.role === "assistant") {
    return describeResponse({ text: message.text, toolCalls: message.toolCalls })
  }
  return describeResults(message.results)
}

function describeResponse(response: {
  text: string
  toolCalls: AgentToolCall[]
}): string {
  const lines: string[] = []
  if (response.text.trim()) lines.push(response.text.trim())
  for (const call of response.toolCalls) {
    lines.push(`→ ${call.toolName}(${truncate(JSON.stringify(call.args))})`)
  }
  return lines.join("\n")
}

function describeResults(results: AgentToolResult[]): string {
  return results
    .map(
      (result) =>
        `${result.toolName}${result.isError ? " ERROR" : ""}: ` +
        truncate(JSON.stringify(result.result)),
    )
    .join("\n")
}

function truncate(value: string | undefined, max = 2000): string {
  if (!value) return ""
  return value.length > max ? `${value.slice(0, max)}… (${value.length} chars)` : value
}
