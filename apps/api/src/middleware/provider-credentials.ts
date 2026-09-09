import type { Context } from "hono"
import {
  credentialValue,
  extractCredentialsFromHeaders,
  getDefaultProviderRegistry,
  mergeWithServerCredentials,
  type ProviderRegistry,
  type ResolvedCredentials,
} from "@adt/llm"

export { credentialValue }

/**
 * Header value if present, else the provider's server-resolved credential
 * (environment). Routes that read a field directly must use this rather than
 * `credentialValue`, or a key configured only on the server — which /providers
 * reports as configuredOnServer and the UI treats as available — works for
 * pipeline runs but 400s here.
 */
export function serverAwareCredentialValue(
  credentials: ResolvedCredentials,
  providerId: string,
  fieldKey: string,
  registry: ProviderRegistry = getDefaultProviderRegistry(),
): string | undefined {
  if (!registry.has(providerId)) return credentialValue(credentials, providerId, fieldKey)
  const merged = mergeWithServerCredentials(registry.get(providerId), credentials[providerId])
  const value = merged[fieldKey]?.trim()
  return value ? value : undefined
}

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
