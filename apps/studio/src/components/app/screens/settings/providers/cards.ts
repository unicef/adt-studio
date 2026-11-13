/* eslint-disable lingui/no-unlocalized-strings -- vendor names, mirroring the server manifests' displayName. */
// Kept free of Lingui macros so code outside Settings (e.g. "connect provider"
// prompts) can resolve a backend's card without pulling in translated copy.

/**
 * A card is a vendor, not a backend. Vendors that offer both an API and a local CLI
 * (OpenAI → Codex, Anthropic → Claude Agent) collapse into one card whose CLI ↔ API-key
 * toggle selects which underlying provider you configure. Each mode keeps its own
 * modalities, credentials and connection state; model assignment stays in Settings → Models.
 */
export interface ProviderCardDef {
  key: string
  displayName: string
  uiId: string
  apiKeyProviderId?: string
  cliProviderId?: string
  localProviderId?: string
  cliLabel?: string
}

export const PROVIDER_CARDS: Record<string, ProviderCardDef> = {
  openai: { key: "openai", displayName: "OpenAI", uiId: "openai", apiKeyProviderId: "openai", cliProviderId: "codex", cliLabel: "Codex CLI" },
  anthropic: { key: "anthropic", displayName: "Anthropic", uiId: "anthropic", apiKeyProviderId: "anthropic", cliProviderId: "claude-agent", cliLabel: "Claude Code" },
  google: { key: "google", displayName: "Google", uiId: "google", apiKeyProviderId: "google" },
  custom: { key: "custom", displayName: "Custom (OpenAI-compatible)", uiId: "custom", apiKeyProviderId: "custom" },
  ollama: { key: "ollama", displayName: "Ollama", uiId: "ollama", localProviderId: "ollama" },
  azure: { key: "azure", displayName: "Azure Speech", uiId: "azure", apiKeyProviderId: "azure" },
  elevenlabs: { key: "elevenlabs", displayName: "ElevenLabs", uiId: "elevenlabs", apiKeyProviderId: "elevenlabs" },
  gemini: { key: "gemini", displayName: "Gemini Speech", uiId: "gemini", apiKeyProviderId: "gemini" },
}

/** Every backend id a card can resolve to, in card order. */
export const CARD_PROVIDER_IDS: string[] = Object.values(PROVIDER_CARDS).flatMap((card) =>
  [card.apiKeyProviderId, card.cliProviderId, card.localProviderId].filter(
    (id): id is string => Boolean(id),
  ),
)

/** The card that hosts a backend (e.g. `codex` lives on the OpenAI card); the id itself when none does. */
export function cardKeyForProvider(providerId: string): string {
  const card = Object.values(PROVIDER_CARDS).find((candidate) =>
    [candidate.apiKeyProviderId, candidate.cliProviderId, candidate.localProviderId].includes(providerId),
  )
  return card?.key ?? providerId
}
