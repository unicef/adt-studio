const PROVIDER_ANCHOR_PREFIX = "settings-provider-"
export const providerAnchor = (provider: string) => `${PROVIDER_ANCHOR_PREFIX}${provider}`
export const providerFromAnchor = (hash: string): string | null =>
  hash.startsWith(PROVIDER_ANCHOR_PREFIX) ? hash.slice(PROVIDER_ANCHOR_PREFIX.length) : null

/** `?auth=api-key` opens the anchored provider card on its API-key backend with the key field focused. */
export type ProviderAuthSearch = { auth?: "api-key" }
export const parseProviderAuthSearch = (search: Record<string, unknown>): ProviderAuthSearch =>
  search.auth === "api-key" ? { auth: "api-key" } : {}
