import type { ProviderHealthCode, ProviderHealthResponse } from "@adt/types"
import { AiProviderError, type AnyProviderModule } from "./ports/index.js"
import { ModelDiscoveryError } from "./model-discovery.js"
import { resolveProviderCredentials, type ResolvedCredentials } from "./credentials.js"
import type { ProviderRegistry } from "./registry.js"
import type { LogLevel } from "./logger.js"

const MAX_DETAIL_LENGTH = 200

export interface CheckProviderConnectionOptions {
  credentials?: ResolvedCredentials
  logLevel?: LogLevel
  signal?: AbortSignal
}

/**
 * Never throws: every failure mode becomes a non-`ok` response so the Settings
 * screen can always render a verdict. Details are only ever taken from errors
 * this codebase raises itself, so a provider echoing a credential back in its
 * error body can never reach the client.
 */
export async function checkProviderConnection(
  registry: ProviderRegistry,
  providerId: string,
  options: CheckProviderConnectionOptions = {},
): Promise<ProviderHealthResponse> {
  const module = registry.tryGet(providerId)
  if (!module) return { providerId, ok: false, code: "unsupported" }

  let credentials: Record<string, string>
  try {
    credentials = resolveProviderCredentials(module, options.credentials)
  } catch (error) {
    return failure(providerId, error, false)
  }

  const hasCredential = Object.values(credentials).some((value) => value.trim().length > 0)

  if (typeof module.checkConnection === "function") {
    try {
      const status = await module.checkConnection({
        providerId,
        credentials,
        signal: options.signal,
        logLevel: options.logLevel,
      })
      return {
        providerId,
        ok: status.ok,
        code: status.code,
        modelCount: status.modelCount,
        detail: truncate(status.detail),
      }
    } catch (error) {
      return failure(providerId, error, hasCredential)
    }
  }

  if (typeof module.listModels === "function") {
    try {
      const models = await registry.listModels(providerId, {
        credentials: options.credentials,
        logLevel: options.logLevel,
        signal: options.signal,
      })
      return { providerId, ok: true, code: "ok", modelCount: models.length }
    } catch (error) {
      return failure(providerId, error, hasCredential)
    }
  }

  return { providerId, ...withoutLiveCheck(module) }
}

/** No probe available: the most we can honestly report is credential presence. */
function withoutLiveCheck(
  module: AnyProviderModule,
): { ok: boolean; code: ProviderHealthCode } {
  const requiresCredential = module.manifest.credentialFields.some(
    (field) => field.required,
  )
  return requiresCredential
    ? { ok: true, code: "configured" }
    : { ok: false, code: "unsupported" }
}

function failure(
  providerId: string,
  error: unknown,
  hasCredential: boolean,
): ProviderHealthResponse {
  if (error instanceof ModelDiscoveryError) {
    const code =
      error.code === "missing-credential" && hasCredential
        ? "invalid-credential"
        : error.code
    return { providerId, ok: false, code, detail: truncate(error.message) }
  }
  if (error instanceof AiProviderError) {
    const code: ProviderHealthCode =
      error.code === "missing-credential"
        ? "missing-credential"
        : error.code === "invalid-credential"
          ? "invalid-credential"
          : "unsupported"
    return { providerId, ok: false, code, detail: truncate(error.message) }
  }
  return { providerId, ok: false, code: "unreachable" }
}

function truncate(detail: string | undefined): string | undefined {
  if (!detail) return undefined
  const trimmed = detail.trim()
  if (!trimmed) return undefined
  return trimmed.length > MAX_DETAIL_LENGTH
    ? `${trimmed.slice(0, MAX_DETAIL_LENGTH - 1)}…`
    : trimmed
}
