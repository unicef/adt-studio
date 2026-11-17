import { useEffect, useState } from "react"
import { useLocation, useSearch } from "@tanstack/react-router"
import { PROVIDER_CARDS } from "./cards"
import { providerFromAnchor, type ProvidersSearch } from "../provider-anchor"

/**
 * Which provider card is open, starting with the one the URL's hash points at
 * (`#settings-provider-<card>`), so a "connect" or "key rejected" link lands
 * on that card expanded. Cards open one at a time. Shared by Settings → AI
 * providers and a book's API keys screen.
 */
export function useLinkedCard() {
  const { hash } = useLocation()
  const { auth } = useSearch({ strict: false }) as ProvidersSearch
  const linkedCard = hash ? providerFromAnchor(hash) : null
  const [openId, setOpenId] = useState<string | null>(null)

  useEffect(() => {
    if (linkedCard && PROVIDER_CARDS[linkedCard]) setOpenId(linkedCard)
  }, [linkedCard])

  return {
    openId,
    onToggle: (cardKey: string) => setOpenId((prev) => (prev === cardKey ? null : cardKey)),
    linkedCard,
    requestedAuth: auth,
  }
}
