import { tmpdir } from "node:os"
import type {
  BackendContext,
  StructuredTextBackend,
  StructuredTextRequest,
  StructuredTextResult,
  TokenUsage,
} from "../../ports/index.js"
import { extractJsonObject } from "../shared/ai-sdk/structured-text.js"
import { hasClaudeCliLogin } from "../shared/local-cli-auth.js"
import {
  runClaudeCli,
  type ClaudeAgentResultEvent,
  type ClaudeAgentUsage,
  type ClaudeCliRunner,
} from "./cli.js"
import {
  MISSING_CLAUDE_CLI_MESSAGE,
  resolveClaudeAgentExecutable,
} from "./executable.js"
import { asZodLike, toJsonSchema, toPromptBlocks } from "./request.js"

/** A type alias, not an interface: `ProviderCredentialValues` needs an implicit index signature. */
export type ClaudeAgentCredentials = { apiKey?: string }

export interface ClaudeAgentBackendOptions {
  /** Injected by tests; production spawns the real CLI. */
  runCli?: ClaudeCliRunner
  resolveExecutable?: () => string | undefined
  scratchDir?: string
}

/** Spawning the CLI on top of a cold model call needs more headroom than HTTP. */
const DEFAULT_TIMEOUT_MS = 300_000

/**
 * Describe the Claude Code session that launched this server. Inheriting them
 * makes the child believe it is a nested session, and `CLAUDE_EFFORT` would
 * change results behind an unchanged cache key.
 */
const NESTED_SESSION_ENV_KEYS = [
  "CLAUDECODE",
  "CLAUDE_AGENT_SDK_VERSION",
  "CLAUDE_CODE_CHILD_SESSION",
  "CLAUDE_CODE_ENTRYPOINT",
  "CLAUDE_CODE_EXECPATH",
  "CLAUDE_CODE_SESSION_ID",
  "CLAUDE_EFFORT",
  "CLAUDE_PID",
] as const

/** The CLI prefers any of these over its own login, so only a resolved credential may set one. */
const CLI_CREDENTIAL_ENV_KEYS = [
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_AUTH_TOKEN",
  "CLAUDE_CODE_OAUTH_TOKEN",
] as const

export function createClaudeAgentStructuredTextBackend(
  context: BackendContext<ClaudeAgentCredentials>,
  options: ClaudeAgentBackendOptions = {},
): StructuredTextBackend {
  const runCli = options.runCli ?? runClaudeCli
  const resolveExecutable = options.resolveExecutable ?? resolveClaudeAgentExecutable
  const cwd = options.scratchDir ?? tmpdir()

  return {
    async generateStructured<T>(
      request: StructuredTextRequest,
    ): Promise<StructuredTextResult<T>> {
      const executable = resolveExecutable()
      if (!executable) {
        throw new Error(MISSING_CLAUDE_CLI_MESSAGE)
      }

      const schema = toJsonSchema(request.schema)
      const native = request.strategy === "native-schema"
      const systemPrompt = buildSystemPrompt(request.system, native ? undefined : schema)

      const turn = await runCli({
        executable,
        model: context.modelId,
        userMessage: {
          type: "user",
          message: { role: "user", content: toPromptBlocks(request.messages) },
          parent_tool_use_id: null,
        },
        ...(systemPrompt ? { systemPrompt } : {}),
        ...(native ? { schemaJson: JSON.stringify(schema) } : {}),
        env: buildClaudeAgentEnv(context.credentials.apiKey),
        signal: buildAbortSignal(request),
        cwd,
      })

      const result = turn.resultEvent
      if (!result) {
        const stderr = turn.stderr.trim().slice(-400)
        throw new Error(
          `Claude Code CLI exited with code ${turn.exitCode} without a result message${
            stderr ? `: ${stderr}` : ""
          }${authFailureHint(context.credentials.apiKey)}`,
        )
      }
      if (result.subtype !== "success" || result.is_error) {
        throw new Error(
          `Claude Agent turn failed (${result.subtype})${formatErrors(result)}${authFailureHint(context.credentials.apiKey)}`,
        )
      }

      const usage = toTokenUsage(result.usage)
      const rawText = result.result
      const value =
        result.structured_output !== undefined
          ? result.structured_output
          : rawText
            ? extractJsonObject(rawText)
            : null

      if (value === null || value === undefined) {
        throw new Error(
          `Claude Agent returned no structured output. Response: ${(rawText ?? "").slice(0, 400)}`,
        )
      }

      const zod = asZodLike(request.schema)
      if (!zod) {
        return { object: value as T, usage, ...(rawText ? { rawText } : {}) }
      }

      const parsed = zod.safeParse(value)
      if (!parsed.success) {
        throw new Error(
          `Claude Agent output did not match the schema. Response: ${JSON.stringify(value).slice(0, 400)}`,
        )
      }
      return { object: parsed.data as T, usage, ...(rawText ? { rawText } : {}) }
    },
  }
}

/**
 * The CLI's `--json-schema` validation cannot express `$ref`, so recursive and
 * loose schemas arrive here as a non-native strategy and get the schema spelled
 * out in the system prompt instead.
 */
function buildSystemPrompt(
  system: string | undefined,
  schema: Record<string, unknown> | undefined,
): string | undefined {
  const instruction = schema
    ? `Reply with a single JSON object that validates against this JSON Schema. Emit no prose, no explanation and no code fences.\n\n${JSON.stringify(schema)}`
    : undefined

  const systemPrompt = [system, instruction].filter(Boolean).join("\n\n")
  return systemPrompt || undefined
}

/**
 * `env` replaces the child environment wholesale, so `process.env` has to be
 * spread in for PATH/HOME.
 *
 * Every credential variable is dropped first: with a resolved key that key is the
 * one that must be billed, and without one the CLI's own login is the sanctioned
 * fallback — an ambient token nobody configured here must not bill a third party.
 *
 * `MAX_THINKING_TOKENS=0` disables the CLI's adaptive thinking, which multiplies
 * output tokens 10–30× on extraction turns without improving schema fidelity.
 */
export function buildClaudeAgentEnv(
  apiKey: string | undefined,
): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = { ...process.env }
  for (const key of NESTED_SESSION_ENV_KEYS) delete env[key]
  for (const key of CLI_CREDENTIAL_ENV_KEYS) delete env[key]
  if (apiKey) env.ANTHROPIC_API_KEY = apiKey
  env.MAX_THINKING_TOKENS = "0"
  return env
}

/** Existence check only, and only once a turn has already failed. */
function authFailureHint(apiKey: string | undefined): string {
  if (apiKey || hasClaudeCliLogin()) return ""
  return ". No API key is configured and no Claude CLI login was found — run `claude login` on this machine or set an API key"
}

function buildAbortSignal(request: StructuredTextRequest): AbortSignal {
  const timeout = AbortSignal.timeout(request.timeoutMs ?? DEFAULT_TIMEOUT_MS)
  return request.signal ? AbortSignal.any([timeout, request.signal]) : timeout
}

/** Session-cumulative in the CLI's result event, which equals the turn for a single round. */
function toTokenUsage(usage: ClaudeAgentUsage | undefined): TokenUsage {
  return {
    inputTokens:
      (usage?.input_tokens ?? 0) +
      (usage?.cache_creation_input_tokens ?? 0) +
      (usage?.cache_read_input_tokens ?? 0),
    outputTokens: usage?.output_tokens ?? 0,
  }
}

function formatErrors(result: ClaudeAgentResultEvent): string {
  if (result.errors?.length) return `: ${result.errors.join("; ")}`
  if (result.result) return `: ${result.result.slice(0, 400)}`
  return ""
}
