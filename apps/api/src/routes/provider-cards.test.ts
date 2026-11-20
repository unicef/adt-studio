import { describe, expect, it } from "vitest"
import { BUILT_IN_PROVIDERS } from "@adt/llm"
import { CARD_PROVIDER_IDS } from "../../../studio/src/components/app/screens/settings/providers/cards.js"

/**
 * Studio enters keys only through the provider cards (Settings → AI providers
 * and a book's API keys screen). A provider registered here without a card
 * would have no key field anywhere, so registering one has to add its card.
 */
describe("provider cards", () => {
  it.each(BUILT_IN_PROVIDERS.map((module) => module.manifest.id))(
    "gives the registered provider %s a card in Studio",
    (providerId) => {
      expect(CARD_PROVIDER_IDS).toContain(providerId)
    },
  )
})
