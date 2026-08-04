import { tmpdir } from "node:os"
import { MODEL_PART_PATTERN } from "@adt/types"
import type { DiscoveredModel, ModelListContext } from "../../ports/index.js"
import { ModelDiscoveryError } from "../../model-discovery.js"
import { claudeCliCredentialPaths, hasLocalCliLogin } from "../shared/local-cli-auth.js"
import {
  loadClaudeAgentQuery,
  type ClaudeAgentModelInfo,
  type ClaudeAgentQuery,
  type ClaudeAgentQueryStream,
  type ClaudeAgentUserMessage,
} from "./sdk.js"
import { buildClaudeAgentEnv, type ClaudeAgentCredentials } from "./structured-text.js"

export interface ClaudeAgentModelDiscoveryProbe {
  loadQuery?: () => Promise<ClaudeAgentQuery>
  hasLogin?: () => boolean
  scratchDir?: string
  timeoutMs?: number
}

/** Covers the CLI cold start plus one control-protocol round trip, never a model call. */
const DISCOVERY_TIMEOUT_MS = 60_000

/**
 * The CLI login is not an API credential, so the catalogue comes from the SDK
 * itself: a session is opened with a prompt stream that never yields (no turn
 * is spent), `supportedModels()` is answered over the control protocol, and the
 * session is aborted.
 */
export async function listClaudeAgentModels(
  context: ModelListContext<ClaudeAgentCredentials>,
  probe: ClaudeAgentModelDiscoveryProbe = {},
): Promise<DiscoveredModel[]> {
  const apiKey = context.credentials.apiKey
  const hasLogin = probe.hasLogin ?? (() => hasLocalCliLogin(claudeCliCredentialPaths()))
  if (!apiKey && !hasLogin()) {
    throw new ModelDiscoveryError(
      "missing-credential",
      "No API key is configured and no Claude CLI login was found — run `claude login` on this machine or set an API key",
    )
  }

  let query: ClaudeAgentQuery
  try {
    query = await (probe.loadQuery ?? loadClaudeAgentQuery)()
  } catch {
    throw new ModelDiscoveryError(
      "unreachable",
      "@anthropic-ai/claude-agent-sdk is not installed on this server",
    )
  }

  const controller = new AbortController()
  const timeout = AbortSignal.timeout(probe.timeoutMs ?? DISCOVERY_TIMEOUT_MS)
  const signal = context.signal ? AbortSignal.any([timeout, context.signal]) : timeout
  const abort = (): void => controller.abort()
  if (signal.aborted) abort()
  signal.addEventListener("abort", abort, { once: true })

  const stream = query({
    prompt: idlePrompt(controller.signal),
    options: {
      cwd: probe.scratchDir ?? tmpdir(),
      maxTurns: 1,
      tools: [],
      settingSources: [],
      persistSession: false,
      permissionMode: "default",
      abortController: controller,
      env: buildClaudeAgentEnv(apiKey),
    },
  })

  try {
    if (typeof stream.supportedModels !== "function") {
      throw new ModelDiscoveryError(
        "invalid-response",
        "The installed Claude Agent SDK does not expose supportedModels()",
      )
    }
    return toDiscoveredModels(await raceAbort(stream.supportedModels(), signal))
  } catch (error) {
    if (error instanceof ModelDiscoveryError) throw error
    throw new ModelDiscoveryError(
      "unreachable",
      error instanceof Error ? error.message : String(error),
    )
  } finally {
    signal.removeEventListener("abort", abort)
    controller.abort()
    await closeStream(stream)
  }
}

async function* idlePrompt(
  signal: AbortSignal,
): AsyncGenerator<ClaudeAgentUserMessage, void, undefined> {
  await new Promise<void>((resolve) => {
    if (signal.aborted) {
      resolve()
      return
    }
    signal.addEventListener("abort", () => resolve(), { once: true })
  })
}

function raceAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => reject(new Error("model discovery timed out"))
    if (signal.aborted) {
      onAbort()
    } else {
      signal.addEventListener("abort", onAbort, { once: true })
    }
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort)
        resolve(value)
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort)
        reject(error instanceof Error ? error : new Error(String(error)))
      },
    )
  })
}

async function closeStream(stream: ClaudeAgentQueryStream): Promise<void> {
  try {
    await stream[Symbol.asyncIterator]().return?.(undefined)
  } catch {
    return
  }
}

/**
 * Alias ids the rest of the app cannot round-trip (e.g. `opus[1m]` fails
 * `MODEL_PART_PATTERN`) are dropped rather than surfaced as unselectable rows.
 */
function toDiscoveredModels(models: ClaudeAgentModelInfo[]): DiscoveredModel[] {
  if (!Array.isArray(models)) {
    throw new ModelDiscoveryError(
      "invalid-response",
      "The Claude Agent SDK returned a malformed model list",
    )
  }
  const discovered: DiscoveredModel[] = []
  for (const model of models) {
    if (typeof model?.value !== "string" || !MODEL_PART_PATTERN.test(model.value)) {
      continue
    }
    discovered.push({
      id: model.value,
      ...(model.displayName ? { displayName: model.displayName } : {}),
    })
  }
  if (discovered.length === 0) {
    throw new ModelDiscoveryError(
      "invalid-response",
      "The Claude Agent SDK returned no usable models",
    )
  }
  return discovered
}
