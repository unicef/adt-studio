const PROVIDER_ANCHOR_PREFIX = "settings-provider-"
export const providerAnchor = (provider: string) => `${PROVIDER_ANCHOR_PREFIX}${provider}`
export const providerFromAnchor = (hash: string): string | null =>
  hash.startsWith(PROVIDER_ANCHOR_PREFIX) ? hash.slice(PROVIDER_ANCHOR_PREFIX.length) : null
