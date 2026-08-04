import { tmpdir } from "node:os"
import type {
  BackendContext,
  StructuredTextBackend,
  StructuredTextRequest,
  StructuredTextResult,
  TokenUsage,
} from "../../ports/index.js"
import { extractJsonObject } from "../shared/ai-sdk/structured-text.js"
import { claudeCliCredentialPaths, hasLocalCliLogin } from "../shared/local-cli-auth.js"
import { asZodLike, toJsonSchema, toPromptBlocks, toPromptStream } from "./request.js"
import {
  isResultMessage,
  loadClaudeAgentQuery,
  type ClaudeAgentQuery,
  type ClaudeAgentQueryOptions,
  type ClaudeAgentResultMessage,
  type ClaudeAgentUsage,
} from "./sdk.js"

/** A type alias, not an interface: `ProviderCredentialValues` needs an implicit index signature. */
export type ClaudeAgentCredentials = { apiKey?: string }

export interface ClaudeAgentBackendOptions {
  /** Injected by tests; production resolves the SDK lazily. */
  loadQuery?: () => Promise<ClaudeAgentQuery>
  scratchDir?: string
}

/** Spawning the CLI on top of a cold model call needs more headroom than HTTP. */
const DEFAULT_TIMEOUT_MS = 300_000

const NO_BUILT_IN_TOOLS: string[] = []
const NO_FILESYSTEM_SETTINGS: string[] = []

/**
 * The CLI defaults to adaptive thinking, which multiplies output tokens 10–30×
 * on extraction turns without improving schema fidelity.
 */
const NO_THINKING = { type: "disabled" } as const
const CLIENT_APP = "adt-studio"

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
  const loadQuery = options.loadQuery ?? loadClaudeAgentQuery
  const cwd = options.scratchDir ?? tmpdir()

  return {
    async generateStructured<T>(
      request: StructuredTextRequest,
    ): Promise<StructuredTextResult<T>> {
      const query = await loadQuery()
      const schema = toJsonSchema(request.schema)
      const native = request.strategy === "native-schema"

      const controller = new AbortController()
      const abort = (): void => controller.abort()
      const signal = buildAbortSignal(request)
      if (signal.aborted) abort()
      signal.addEventListener("abort", abort, { once: true })

      let result: ClaudeAgentResultMessage | undefined
      try {
        const stream = query({
          prompt: toPromptStream(toPromptBlocks(request.messages)),
          options: {
            model: context.modelId,
            ...buildSystemPrompt(request.system, native ? undefined : schema),
            cwd,
            maxTurns: 1,
            tools: NO_BUILT_IN_TOOLS,
            settingSources: NO_FILESYSTEM_SETTINGS,
            persistSession: false,
            permissionMode: "default",
            ...(native ? { outputFormat: { type: "json_schema" as const, schema } } : {}),
            thinking: NO_THINKING,
            abortController: controller,
            env: buildClaudeAgentEnv(context.credentials.apiKey),
          },
        })

        for await (const message of stream) {
          if (isResultMessage(message)) result = message
        }
      } finally {
        signal.removeEventListener("abort", abort)
      }

      if (!result) {
        throw new Error(
          `Claude Agent stream ended without a result message${authFailureHint(context.credentials.apiKey)}`,
        )
      }
      if (result.subtype !== "success" || result.is_error) {
        throw new Error(
          `Claude Agent turn failed (${result.subtype})${formatErrors(result.errors)}${authFailureHint(context.credentials.apiKey)}`,
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
 * The CLI's `json_schema` output format cannot express `$ref`, so recursive and
 * loose schemas arrive here as a non-native strategy and get the schema spelled
 * out in the system prompt instead.
 */
function buildSystemPrompt(
  system: string | undefined,
  schema: Record<string, unknown> | undefined,
): Pick<ClaudeAgentQueryOptions, "systemPrompt"> {
  const instruction = schema
    ? `Reply with a single JSON object that validates against this JSON Schema. Emit no prose, no explanation and no code fences.\n\n${JSON.stringify(schema)}`
    : undefined

  const systemPrompt = [system, instruction].filter(Boolean).join("\n\n")
  return systemPrompt ? { systemPrompt } : {}
}

/**
 * `env` replaces the child environment wholesale, so `process.env` has to be
 * spread in for PATH/HOME.
 *
 * Every credential variable is dropped first: with a resolved key that key is the
 * one that must be billed, and without one the CLI's own login is the sanctioned
 * fallback — an ambient token nobody configured here must not bill a third party.
 */
export function buildClaudeAgentEnv(
  apiKey: string | undefined,
): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = { ...process.env }
  for (const key of NESTED_SESSION_ENV_KEYS) delete env[key]
  for (const key of CLI_CREDENTIAL_ENV_KEYS) delete env[key]
  if (apiKey) env.ANTHROPIC_API_KEY = apiKey
  env.CLAUDE_AGENT_SDK_CLIENT_APP = CLIENT_APP
  return env
}

/** Existence check only, and only once a turn has already failed. */
function authFailureHint(apiKey: string | undefined): string {
  if (apiKey || hasLocalCliLogin(claudeCliCredentialPaths())) return ""
  return ". No API key is configured and no Claude CLI login was found — run `claude login` on this machine or set an API key"
}

function buildAbortSignal(request: StructuredTextRequest): AbortSignal {
  const timeout = AbortSignal.timeout(request.timeoutMs ?? DEFAULT_TIMEOUT_MS)
  return request.signal ? AbortSignal.any([timeout, request.signal]) : timeout
}

/** Session-cumulative in the SDK, which equals the turn for a single round. */
function toTokenUsage(usage: ClaudeAgentUsage | undefined): TokenUsage {
  return {
    inputTokens:
      (usage?.input_tokens ?? 0) +
      (usage?.cache_creation_input_tokens ?? 0) +
      (usage?.cache_read_input_tokens ?? 0),
    outputTokens: usage?.output_tokens ?? 0,
  }
}

function formatErrors(errors: string[] | undefined): string {
  return errors?.length ? `: ${errors.join("; ")}` : ""
}
