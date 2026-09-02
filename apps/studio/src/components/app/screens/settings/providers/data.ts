/* eslint-disable lingui/no-unlocalized-strings -- vendor names, mirroring the server manifests' displayName. */
import { msg } from "@lingui/core/macro"
import type { MessageDescriptor } from "@lingui/core"

export interface RoleGroup {
  key: string
  label: MessageDescriptor
  hint: MessageDescriptor
  /** Card keys (see PROVIDER_CARDS), not raw provider ids. */
  cards: string[]
}

export const ROLE_GROUPS: RoleGroup[] = [
  {
    key: "reasoning",
    label: msg`Models & reasoning`,
    hint: msg`Which engine runs the extraction and generation pipeline.`,
    cards: ["openai", "anthropic", "google", "custom", "ollama"],
  },
  {
    key: "speech",
    label: msg`Speech & voices`,
    hint: msg`Text-to-speech engines that narrate the finished book.`,
    cards: ["azure", "elevenlabs", "gemini"],
  },
]

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
