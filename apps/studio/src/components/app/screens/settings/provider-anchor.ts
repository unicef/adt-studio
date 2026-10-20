const PROVIDER_ANCHOR_PREFIX = "settings-provider-"
export const providerAnchor = (provider: string) => `${PROVIDER_ANCHOR_PREFIX}${provider}`
export const providerFromAnchor = (hash: string): string | null =>
  hash.startsWith(PROVIDER_ANCHOR_PREFIX) ? hash.slice(PROVIDER_ANCHOR_PREFIX.length) : null

/**
 * `?auth=api-key` opens the anchored provider card on its API-key backend with the key field focused.
 * `?from=add-book` offers a way back to the Add Book wizard once a provider is connected.
 */
export type ProvidersSearch = { auth?: "api-key"; from?: "add-book" }
export const parseProvidersSearch = (search: Record<string, unknown>): ProvidersSearch => ({
  ...(search.auth === "api-key" ? { auth: "api-key" as const } : {}),
  ...(search.from === "add-book" ? { from: "add-book" as const } : {}),
})
