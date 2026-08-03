import {
  runAgentLoop,
  type AgentLogContext,
  type AgentToolCall,
  type AgentToolSet,
  type LlmLogEntry,
  type ProviderRegistry,
  type TokenUsage,
} from "@adt/llm"
import type { AgentCredentials } from "./credentials.js"

export interface AgentStepEvent {
  stepIndex: number
  toolCalls: Array<{ toolName: string; args: unknown }>
  text: string
  finishReason: string
  cacheHit: boolean
}

export interface RunAgentOptions {
  modelId: string
  system: string
  prompt: string
  tools: AgentToolSet
  /** Max inference turns. Default 20. */
  maxSteps?: number
  credentials?: AgentCredentials
  /** Per-turn timeout. */
  timeoutMs?: number
  /** Must not throw — errors here are swallowed so they cannot break the agent loop. */
  onStepFinish?: (event: AgentStepEvent) => void
  /** Enables per-turn inference caching inside the book directory. */
  cacheDir?: string
  onLog?: (entry: LlmLogEntry) => void
  log?: AgentLogContext
  registry?: ProviderRegistry
  signal?: AbortSignal
}

export interface RunAgentResult {
  text: string
  stepCount: number
  usage: TokenUsage
  finishReason: string
}

export async function runAgent(opts: RunAgentOptions): Promise<RunAgentResult> {
  const onStepFinish = opts.onStepFinish
  const result = await runAgentLoop({
    modelId: opts.modelId,
    system: opts.system,
    prompt: opts.prompt,
    tools: opts.tools,
    maxSteps: opts.maxSteps,
    timeoutMs: opts.timeoutMs,
    signal: opts.signal,
    registry: opts.registry,
    credentials: opts.credentials,
    cacheDir: opts.cacheDir,
    onLog: opts.onLog,
    log: opts.log,
    onTurn: onStepFinish
      ? (turn) =>
          onStepFinish({
            stepIndex: turn.index,
            toolCalls: turn.toolCalls.map((call: AgentToolCall) => ({
              toolName: call.toolName,
              args: call.args,
            })),
            text: turn.text,
            finishReason: turn.finishReason,
            cacheHit: turn.cacheHit,
          })
      : undefined,
  })

  return {
    text: result.text,
    stepCount: result.stepCount,
    usage: result.usage,
    finishReason: result.finishReason,
  }
}
