import { useCallback } from "react"
import { useNavigate } from "@tanstack/react-router"
import { providerAnchor, type ProvidersSearch } from "@/components/app/screens/settings/provider-anchor"
import { cardKeyForProvider } from "@/components/app/screens/settings/providers/cards"

/**
 * Opens Settings → AI providers with a card expanded on its API-key field —
 * OpenAI by default, the starting point every "connect" prompt shares, or
 * `providerId`'s card when a prompt is about one provider (a rejected key).
 * Prompts inside the Add Book wizard pass `from: "add-book"` so the page
 * offers a way back.
 */
export function useConnectProvider({
  from,
  providerId = "openai",
}: Pick<ProvidersSearch, "from"> & { providerId?: string } = {}) {
  const navigate = useNavigate()
  return useCallback(
    () =>
      navigate({
        to: "/settings/providers",
        search: from ? { auth: "api-key", from } : { auth: "api-key" },
        hash: providerAnchor(cardKeyForProvider(providerId)),
      }),
    [navigate, from, providerId],
  )
}
