import { useCallback } from "react"
import { useNavigate } from "@tanstack/react-router"
import { providerAnchor } from "@/components/app/screens/settings/provider-anchor"

/**
 * Opens Settings → AI providers with the OpenAI card expanded on its API-key
 * field, the starting point every "connect" prompt shares.
 */
export function useConnectProvider() {
  const navigate = useNavigate()
  return useCallback(
    () =>
      navigate({
        to: "/settings/providers",
        search: { auth: "api-key" },
        hash: providerAnchor("openai"),
      }),
    [navigate],
  )
}
