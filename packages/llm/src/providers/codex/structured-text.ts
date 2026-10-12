import { LLMValidationError } from "../../errors.js"
import { knownTokenUsage } from "../../token-usage.js"
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
    reportsProviderRequests: true,
    async generateStructured<T>(request: StructuredTextRequest): Promise<StructuredTextResult<T>> {
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
        onProviderRequest: request.onProviderRequest,
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
        if (cause instanceof LLMValidationError) throw cause
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
        // CLI-reported failures are provider errors, not invalid model output.
        if (turn.advisoryErrors.length)
          throw new Error(`Codex returned no structured output: ${turn.advisoryErrors.join("; ")}`)
        throw new LLMValidationError(
          ["Codex returned no structured output. Return a JSON object only."],
          rawText,
          usage,
        )
      }

      const zod = asZodLike(request.schema)
      if (!zod) {
        return { object: value as T, usage, ...(rawText ? { rawText } : {}) }
      }

      const parsed = zod.safeParse(value)
      if (!parsed.success) {
        throw new LLMValidationError(
          ["Codex output did not match the schema. Return corrected JSON."],
          value,
          usage,
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

function buildAbortSignal(request: StructuredTextRequest): AbortSignal {
  const timeout = AbortSignal.timeout(request.timeoutMs ?? DEFAULT_TIMEOUT_MS)
  return request.signal ? AbortSignal.any([timeout, request.signal]) : timeout
}

/**
 * The CLI reports OpenAI Responses usage, where cached input and reasoning output
 * are subsets of their totals rather than additional tokens.
 */
function toTokenUsage(usage: CodexCliUsage | undefined): TokenUsage | undefined {
  if (!usage) return undefined
  return knownTokenUsage({
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
  })
}
