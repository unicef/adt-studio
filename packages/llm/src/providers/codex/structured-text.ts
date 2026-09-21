import type {
  BackendContext,
  StructuredTextBackend,
  StructuredTextRequest,
  StructuredTextResult,
  TokenUsage,
} from "../../ports/index.js"
import { extractJsonObject } from "../shared/ai-sdk/structured-text.js"
import { asZodLike } from "../shared/json-schema.js"
import { codexCliCredentialPaths, hasLocalCliLogin } from "../shared/local-cli-auth.js"
import { runCodexCli, type CodexCliRunner, type CodexCliTurn, type CodexCliUsage } from "./cli.js"
import { buildCodexEnv } from "./env.js"
import { toJsonSchema, toPromptInput } from "./request.js"

/** A type alias, not an interface: `ProviderCredentialValues` needs an implicit index signature. */
export type CodexCredentials = { apiKey?: string }

export interface CodexBackendOptions {
  /** Injected by tests; production spawns the locally installed Codex CLI. */
  runTurn?: CodexCliRunner
  executable?: string
  scratchDir?: string
}

/** Spawning the CLI on top of a cold model call needs more headroom than HTTP. */
const DEFAULT_TIMEOUT_MS = 300_000

export function createCodexStructuredTextBackend(
  context: BackendContext<CodexCredentials>,
  options: CodexBackendOptions = {},
): StructuredTextBackend {
  const runTurn = options.runTurn ?? runCodexCli

  return {
    async generateStructured<T>(
      request: StructuredTextRequest,
    ): Promise<StructuredTextResult<T>> {
      const apiKey = context.credentials.apiKey
      const schema = toJsonSchema(request.schema)
      const native = request.strategy === "native-schema"
      const { prompt, images } = toPromptInput(
        request.system,
        request.messages,
        native ? undefined : schema,
      )

      let turn: CodexCliTurn
      try {
        turn = await runTurn({
          model: context.modelId,
          prompt,
          ...(images.length ? { images } : {}),
          ...(native ? { schema } : {}),
          env: buildCodexEnv(apiKey),
          signal: buildAbortSignal(request),
          ...(options.executable ? { executable: options.executable } : {}),
          ...(options.scratchDir ? { scratchDir: options.scratchDir } : {}),
        })
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : String(cause)
        throw new Error(
          `Codex turn failed: ${redactSecret(message, apiKey)}${authFailureHint(apiKey, message)}`,
          { cause },
        )
      }

      const usage = toTokenUsage(turn.usage)
      const rawText = turn.finalMessage
      const value = rawText ? extractJsonObject(rawText) : null

      if (value === null || value === undefined) {
        throw new Error(
          `Codex returned no structured output${formatAdvisoryErrors(turn.advisoryErrors)}. Response: ${rawText.slice(0, 400)}`,
        )
      }

      const zod = asZodLike(request.schema)
      if (!zod) {
        return { object: value as T, usage, ...(rawText ? { rawText } : {}) }
      }

      const parsed = zod.safeParse(value)
      if (!parsed.success) {
        throw new Error(
          `Codex output did not match the schema. Response: ${JSON.stringify(value).slice(0, 400)}`,
        )
      }
      return { object: parsed.data as T, usage, ...(rawText ? { rawText } : {}) }
    },
  }
}

/** The CLI echoes a rejected key back in its 401 text, and keys are never logged. */
function redactSecret(message: string, apiKey: string | undefined): string {
  return apiKey ? message.split(apiKey).join("[redacted]") : message
}

/**
 * Names the credential the CLI actually used when OpenAI rejects it, because
 * that is rarely the one the user is looking at: a server-side CODEX_API_KEY
 * silently outranks the CLI's own login. The login check is existence only,
 * and only runs once a turn has already failed.
 */
function authFailureHint(apiKey: string | undefined, message: string): string {
  if (/\b401 unauthorized\b|\bstatus 401\b|invalid_api_key|incorrect api key/i.test(message)) {
    return apiKey
      ? ". OpenAI rejected the API key configured for the Codex provider — a Studio setting or the server's CODEX_API_KEY variable, either of which takes precedence over the Codex CLI login. Fix or remove that key"
      : ". OpenAI rejected the Codex CLI's own login — sign in again from Settings → Providers or with `codex login`"
  }
  if (apiKey || hasLocalCliLogin(codexCliCredentialPaths())) return ""
  return ". No API key is configured and no Codex CLI login was found — sign in from Settings → Providers, run `codex login` on this machine, or set an API key"
}

function formatAdvisoryErrors(messages: readonly string[]): string {
  return messages.length ? ` (${messages.join("; ")})` : ""
}

function buildAbortSignal(request: StructuredTextRequest): AbortSignal {
  const timeout = AbortSignal.timeout(request.timeoutMs ?? DEFAULT_TIMEOUT_MS)
  return request.signal ? AbortSignal.any([timeout, request.signal]) : timeout
}

/**
 * The CLI reports OpenAI Responses usage, where cached input and reasoning output
 * are subsets of their totals rather than additional tokens.
 */
function toTokenUsage(usage: CodexCliUsage | undefined): TokenUsage {
  return {
    inputTokens: usage?.input_tokens ?? 0,
    outputTokens: usage?.output_tokens ?? 0,
  }
}
