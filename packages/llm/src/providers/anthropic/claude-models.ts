import { wrapLanguageModel, type LanguageModel, type LanguageModelV1Middleware } from "ai"
import { ModelRefusalError } from "../../ports/errors.js"
import { extractJsonObject } from "../shared/ai-sdk/structured-text.js"

type CallOptions = Parameters<NonNullable<LanguageModelV1Middleware["transformParams"]>>[0]["params"]
type GenerateResult = Awaited<ReturnType<NonNullable<LanguageModelV1Middleware["wrapGenerate"]>>>

/** Rules for the request fields a Claude model rejects with a 400. */
export interface ClaudeModelRules {
  /** temperature, top_p and top_k: Opus 4.7+, Sonnet 5+, Haiku 5+, Fable, Mythos. */
  rejectsSampling: boolean
  /** Thinking runs when the request doesn't ask for it, and counts toward max_tokens. */
  thinksByDefault: boolean
  /** Forced tool_choice (`any` / `tool`): Opus and Sonnet 5.5+, Fable and Mythos 5.1+. */
  rejectsForcedToolChoice: boolean
}

const LEGACY_RULES: ClaudeModelRules = {
  rejectsSampling: false,
  thinksByDefault: false,
  rejectsForcedToolChoice: false,
}

/** For IDs this can't place (a new family, `claude-mythos-preview`). Every
 *  rewrite here is also accepted by older models; only temperature is lost. */
const CURRENT_RULES: ClaudeModelRules = {
  rejectsSampling: true,
  thinksByDefault: true,
  rejectsForcedToolChoice: true,
}

/** Family-first IDs (`claude-opus-5-5`, `claude-opus-4-20250514`). */
const CLAUDE_MODEL_ID = /^claude-(opus|sonnet|haiku|fable|mythos)-(\d+)(?:-(\d{1,2})(?!\d))?/i
/** The older `claude-3-7-sonnet-…` scheme predates every rule here. */
const LEGACY_MODEL_ID = /^claude-(\d|instant)/i

export function claudeModelRules(modelId: string): ClaudeModelRules {
  const match = CLAUDE_MODEL_ID.exec(modelId)
  if (!match) return LEGACY_MODEL_ID.test(modelId) ? LEGACY_RULES : CURRENT_RULES
  const major = Number(match[2])
  const minor = Number(match[3] ?? 0)
  const since = (sinceMajor: number, sinceMinor = 0) =>
    major > sinceMajor || (major === sinceMajor && minor >= sinceMinor)

  switch (match[1]!.toLowerCase()) {
    case "fable":
    case "mythos":
      return {
        rejectsSampling: true,
        thinksByDefault: true,
        rejectsForcedToolChoice: since(5, 1),
      }
    case "opus":
      return {
        rejectsSampling: since(4, 7),
        thinksByDefault: since(5),
        rejectsForcedToolChoice: since(5, 5),
      }
    case "sonnet":
      return {
        rejectsSampling: since(5),
        thinksByDefault: since(5),
        rejectsForcedToolChoice: since(5, 5),
      }
    default:
      // Haiku 5.5 still accepts a forced tool call; it just skips thinking for it.
      return {
        rejectsSampling: since(5),
        thinksByDefault: since(5),
        rejectsForcedToolChoice: false,
      }
  }
}

/** @ai-sdk/anthropic's own fallback when no cap is given. */
const SDK_DEFAULT_MAX_TOKENS = 4096
/** Room for adaptive thinking on top of the caller's answer cap, which was
 *  sized for a model that doesn't think. Only generated tokens are billed, and
 *  output rate limits count generated tokens too, not `max_tokens`. */
const THINKING_HEADROOM_TOKENS = 16_384
const MAX_OUTPUT_TOKENS = 128_000
/** Thinking adds to every call; a long answer would outrun the 90-second
 *  structured-text default and be aborted and retried. */
const THINKING_MIN_TIMEOUT_MS = 300_000

export function claudeTimeoutMs(modelId: string, requested: number | undefined): number | undefined {
  return claudeModelRules(modelId).thinksByDefault
    ? Math.max(requested ?? 0, THINKING_MIN_TIMEOUT_MS)
    : requested
}

function toolInstruction(toolName: string): string {
  return `Give your answer by calling the \`${toolName}\` tool with the complete result as its input. Do not answer in plain text.`
}

/** Inserted after the leading system messages: the Anthropic adapter rejects a
 *  system message that follows a user or assistant turn. */
function withSystemInstruction(prompt: CallOptions["prompt"], instruction: string): CallOptions["prompt"] {
  const firstTurn = prompt.findIndex((message) => message.role !== "system")
  const at = firstTurn === -1 ? prompt.length : firstTurn
  return [...prompt.slice(0, at), { role: "system", content: instruction }, ...prompt.slice(at)]
}

function createClaudeMiddleware(rules: ClaudeModelRules): LanguageModelV1Middleware {
  return {
    // AI SDK v4 sends `temperature: 0` when none is given, so stripping has to
    // happen on the wire, not just in the capability flag.
    transformParams: async ({ params }) => ({
      ...params,
      ...(rules.rejectsSampling ? { temperature: undefined, topP: undefined, topK: undefined } : {}),
      ...(rules.thinksByDefault
        ? {
            maxTokens: Math.min(
              (params.maxTokens ?? SDK_DEFAULT_MAX_TOKENS) + THINKING_HEADROOM_TOKENS,
              MAX_OUTPUT_TOKENS,
            ),
          }
        : {}),
    }),

    wrapGenerate: async ({ doGenerate, params, model }) => {
      // generateObject's tool mode forces `tool_choice: {type: "tool"}`, a 400
      // on these models. Offer the same tool with `auto`, steer toward it from
      // the system prompt, and accept a JSON answer written as text if the
      // model replies without the call; generateObject still checks the schema.
      const tool =
        rules.rejectsForcedToolChoice && params.mode.type === "object-tool"
          ? params.mode.tool
          : undefined
      const result = tool
        ? await model.doGenerate({
            ...params,
            mode: { type: "regular", tools: [tool], toolChoice: { type: "auto" } },
            prompt: withSystemInstruction(params.prompt, toolInstruction(tool.name)),
          })
        : await doGenerate()

      throwIfRefused(result)
      return tool ? withTextAnswer(result, tool.name) : result
    },
  }
}

interface RefusalBody {
  stop_reason?: string
  stop_details?: { category?: string | null; explanation?: string | null } | null
}

/** A safety-classifier decline is an HTTP 200 the SDK maps to finish reason
 *  "unknown"; without this it surfaces as "the tool was not called". */
function throwIfRefused(result: GenerateResult): void {
  const body = result.rawResponse?.body as RefusalBody | undefined
  if (body?.stop_reason !== "refusal") return
  const category = body.stop_details?.category
  const explanation = body.stop_details?.explanation
  throw new ModelRefusalError(
    `Claude declined this request${category ? ` (${category})` : ""}${explanation ? `: ${explanation}` : ""}`,
  )
}

/** Only a reply that ended normally: a truncated one can still hold an
 *  earlier, complete-looking object. */
function withTextAnswer(result: GenerateResult, toolName: string): GenerateResult {
  if (result.toolCalls?.length || result.finishReason !== "stop") return result
  const answer = result.text ? extractJsonObject(result.text) : null
  if (answer === null) return result
  return {
    ...result,
    toolCalls: [
      { toolCallType: "function", toolCallId: "text-answer", toolName, args: JSON.stringify(answer) },
    ],
  }
}

/** Every Anthropic model goes through this, if only for the refusal check. */
export function withClaudeModelRules(modelId: string, model: LanguageModel): LanguageModel {
  return wrapLanguageModel({ model, middleware: createClaudeMiddleware(claudeModelRules(modelId)) })
}
