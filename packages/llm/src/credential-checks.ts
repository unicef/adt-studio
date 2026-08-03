import type { AiModality } from "@adt/types"
import { AiProviderError } from "./ports/errors.js"
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
