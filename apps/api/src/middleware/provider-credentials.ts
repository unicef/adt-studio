import type { Context } from "hono"
import {
  credentialValue,
  extractCredentialsFromHeaders,
  getDefaultProviderRegistry,
  type ProviderRegistry,
  type ResolvedCredentials,
} from "@adt/llm"

export { credentialValue }

/**
 * The single place the API turns request headers into credentials. Every route
 * reads the result instead of naming a provider header, so adding a provider is
 * a manifest change rather than a route change. Values stay request-scoped and
 * are never persisted.
 */
export function readProviderCredentials(
  c: Context,
  registry: ProviderRegistry = getDefaultProviderRegistry(),
): ResolvedCredentials {
  return extractCredentialsFromHeaders(registry.modules(), (name) => c.req.header(name))
}

/** Presence of a single field, for routes that must fail before doing work. */
export function hasCredential(
  credentials: ResolvedCredentials,
  providerId: string,
  fieldKey: string,
): boolean {
  return credentialValue(credentials, providerId, fieldKey) !== undefined
}
