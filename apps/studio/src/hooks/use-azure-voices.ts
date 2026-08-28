import { useQuery } from "@tanstack/react-query"
import { api, type AzureVoice } from "@/api/client"
import { useApiKey } from "./use-api-key"

/**
 * Azure's voice catalogue for one language, so the UI can offer real names
 * instead of asking the user to recall `es-UY-ValentinaNeural` from memory.
 *
 * Unlike OpenAI's and Gemini's, Azure voice names embed their locale, so the
 * list is fetched per language and the API floats exact-locale matches first.
 *
 * Optional polish: with no key or region the endpoint returns an empty array
 * and callers fall back to a free-text input, so this never blocks the Speech
 * settings from loading.
 */
export function useAzureVoices(language?: string) {
  const { azureKey, azureRegion } = useApiKey()
  const hasCredentials = azureKey.length > 0 && azureRegion.length > 0

  const query = useQuery({
    queryKey: ["azure-voices", language ?? "all", hasCredentials ? "keyed" : "anonymous"],
    queryFn: () =>
      api.getAzureVoices(language, {
        azureKey: azureKey || undefined,
        azureRegion: azureRegion || undefined,
      }),
    // Azure's catalogue changes rarely and the API server caches it too.
    staleTime: 30 * 60_000,
    // Without credentials the response is always empty — don't retry that.
    retry: hasCredentials ? 1 : false,
  })

  const voices: AzureVoice[] = query.data?.voices ?? []

  return {
    voices,
    isLoading: query.isLoading,
    /** True when there is no list to offer, so callers should fall back to
     *  free-text entry rather than render an empty picker. */
    isUnavailable: !query.isLoading && voices.length === 0,
    hasCredentials,
  }
}
