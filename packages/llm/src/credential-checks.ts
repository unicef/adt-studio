import type { AiModality, AppConfig, StageName } from "@adt/types"
import { AiProviderError } from "./ports/errors.js"
import { collectStageRunModelChecks } from "./config-validation.js"
import { getDefaultProviderRegistry } from "./providers/index.js"
import type { ProviderRegistry } from "./registry.js"
import type { ResolvedCredentials } from "./credentials.js"

/**
 * Validate that the provider named by `rawModelId` can authenticate for
 * `modality`, using the request-scoped credentials plus whatever that provider
 * resolves from the server environment. Providers whose schema needs no secret
 * pass. Throws `AiProviderError`, so callers get a declarative 4xx instead of
 * hardcoding which header a given model needs.
 */
export function assertModelCredentials(
  modality: AiModality,
  rawModelId: string,
  credentials: ResolvedCredentials | undefined,
  registry: ProviderRegistry = getDefaultProviderRegistry(),
): void {
  registry.capabilities(modality, rawModelId, { credentials })
}

/**
 * Pre-flight for a stage-scoped run: every model the run's stages can route a
 * structured-text call to must be able to authenticate. Throws the first
 * failure with its config field prefixed, so the resulting 4xx names the exact
 * setting to fix rather than a provider the run may not even use.
 */
export function assertStageRunModelCredentials(
  config: AppConfig,
  stages: readonly StageName[],
  credentials: ResolvedCredentials | undefined,
  registry: ProviderRegistry = getDefaultProviderRegistry(),
): void {
  for (const check of collectStageRunModelChecks(config, stages)) {
    try {
      assertModelCredentials(check.modality, check.modelId, credentials, registry)
    } catch (error) {
      if (!AiProviderError.is(error)) throw error
      throw new AiProviderError(error.code, `${check.field}: ${error.message}`, {
        modelId: check.modelId,
        modality: check.modality,
      })
    }
  }
}

/** The same check as a message, for callers that report instead of throwing. */
export function describeMissingModelCredential(
  modality: AiModality,
  rawModelId: string,
  credentials: ResolvedCredentials | undefined,
  registry: ProviderRegistry = getDefaultProviderRegistry(),
): string | null {
  try {
    assertModelCredentials(modality, rawModelId, credentials, registry)
    return null
  } catch (err) {
    if (AiProviderError.is(err)) return err.message
    throw err
  }
}
