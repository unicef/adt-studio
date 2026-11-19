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

export { PROVIDER_CARDS, CARD_PROVIDER_IDS, cardKeyForProvider, type ProviderCardDef } from "./cards"
