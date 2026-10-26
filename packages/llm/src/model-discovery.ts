import type { ModelDiscoveryErrorCode, ModelDiscoveryResponse } from "@adt/types"
import { AiProviderError } from "./ports/index.js"
import type { ListModelsOptions, ProviderRegistry } from "./registry.js"

/**
 * A reachable-but-failed discovery attempt. Advisory: callers turn this into a
 * `ModelDiscoveryResponse` with `supported: false`; it never blocks a model id
 * that passes the real validation paths.
 */
export class ModelDiscoveryError extends Error {
  readonly code: ModelDiscoveryErrorCode

  constructor(code: ModelDiscoveryErrorCode, message?: string) {
    super(message ?? code)
    this.name = "ModelDiscoveryError"
    this.code = code
  }
}

/**
 * Never throws: maps every failure mode to a `supported: false` response so the
 * UI degrades to its static model lists instead of breaking. The returned list
 * is a suggestion, not an authority — the caller still validates any selection.
 */
export async function discoverModels(
  registry: ProviderRegistry,
  providerId: string,
  options: ListModelsOptions = {},
): Promise<ModelDiscoveryResponse> {
  if (!registry.has(providerId)) {
    return { providerId, supported: false, models: [], error: "unsupported" }
  }
  if (!registry.supportsModelDiscovery(providerId)) {
    return { providerId, supported: false, models: [], error: "unsupported" }
  }

  try {
    const models = await registry.listModels(providerId, options)
    return { providerId, supported: true, models }
  } catch (error) {
    return { providerId, supported: false, models: [], error: discoveryErrorCode(error) }
  }
}

function discoveryErrorCode(error: unknown): ModelDiscoveryErrorCode {
  if (error instanceof ModelDiscoveryError) return error.code
  if (error instanceof AiProviderError) {
    if (error.code === "missing-credential" || error.code === "invalid-credential") {
      return "missing-credential"
    }
    return "unsupported"
  }
  return "unreachable"
}
