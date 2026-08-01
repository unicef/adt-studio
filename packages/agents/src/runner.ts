import { generateText, type CoreTool } from "ai"
import { resolveAgentModel, type AgentCredentials } from "./resolve-model.js"

export interface AgentStepEvent {
  stepIndex: number
  /** Vercel AI SDK step type — usually "initial" | "continue" | "tool-result". */
  stepType: string
  /** Tool calls the model made during this step (name + args), if any. */
  toolCalls: Array<{ toolName: string; args: unknown }>
  /** Assistant text produced this step, if any. */
  text: string
  finishReason: string
}

export interface RunAgentOptions {
  modelId: string
  system: string
  prompt: string
  tools: Record<string, CoreTool>
  /** Max tool-call rounds. Default 20. */
  maxSteps?: number
  credentials?: AgentCredentials
  /** Timeout for the whole agent run. Default 5 minutes. */
  timeoutMs?: number
  /**
   * Per-step callback. Called after every model turn so callers can stream
   * progress to a UI surface (e.g. TaskService.emitProgress). Must not throw —
   * errors here are swallowed so they cannot break the agent loop.
   */
  onStepFinish?: (event: AgentStepEvent) => void
}

export interface RunAgentResult {
  text: string
  /** Total tool-call rounds the model executed. */
  stepCount: number
  usage?: { inputTokens: number; outputTokens: number }
  finishReason: string
}

/**
 * Run a tool-using agent loop with the Vercel AI SDK.
 *
 * This is the in-process replacement for the original adt-chat-editor's
 * Codex CLI subprocess. Same contract — instruction + sandboxed surface —
 * but the surface is a typed tool API rather than a filesystem, and the
 * model is whatever the configured modelId resolves to.
 */
export async function runAgent(opts: RunAgentOptions): Promise<RunAgentResult> {
  let stepIndex = 0
  const result = await generateText({
    model: resolveAgentModel(opts.modelId, opts.credentials),
    system: opts.system,
    prompt: opts.prompt,
    tools: opts.tools,
    maxSteps: opts.maxSteps ?? 20,
    abortSignal: AbortSignal.timeout(opts.timeoutMs ?? 5 * 60_000),
    onStepFinish: opts.onStepFinish
      ? (step) => {
          try {
            opts.onStepFinish?.({
              stepIndex: stepIndex++,
              stepType: step.stepType,
              toolCalls: (step.toolCalls ?? []).map((tc) => ({
                toolName: tc.toolName,
                args: tc.args,
              })),
              text: step.text ?? "",
              finishReason: step.finishReason,
            })
          } catch {
            // never let an observer error break the agent loop
          }
        }
      : undefined,
  })

  return {
    text: result.text,
    stepCount: result.steps?.length ?? 0,
    usage: result.usage
      ? {
          inputTokens: result.usage.promptTokens,
          outputTokens: result.usage.completionTokens,
        }
      : undefined,
    finishReason: result.finishReason,
  }
}
