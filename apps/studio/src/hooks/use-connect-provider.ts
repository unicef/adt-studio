import { useCallback } from "react"
import { useNavigate } from "@tanstack/react-router"
import { providerAnchor, type ProvidersSearch } from "@/components/app/screens/settings/provider-anchor"

/**
 * Opens Settings → AI providers with the OpenAI card expanded on its API-key
 * field, the starting point every "connect" prompt shares. Prompts inside the
 * Add Book wizard pass `from: "add-book"` so the page offers a way back.
 */
export function useConnectProvider({ from }: Pick<ProvidersSearch, "from"> = {}) {
  const navigate = useNavigate()
  return useCallback(
    () =>
      navigate({
        to: "/settings/providers",
        search: from ? { auth: "api-key", from } : { auth: "api-key" },
        hash: providerAnchor("openai"),
      }),
    [navigate, from],
  )
}
