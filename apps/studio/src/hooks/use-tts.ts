import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { api, getAudioUrl } from "@/api/client"

/**
 * Fetches TTS entries for a book and returns a lookup map: textId → audio URL.
 */
export function useTTS(label: string) {
  const { data } = useQuery({
    queryKey: ["books", label, "tts"],
    queryFn: () => api.getTTS(label),
    enabled: !!label,
  })

  const audioMap = useMemo(() => {
    const map = new Map<string, string>()
    if (!data?.languages) return map
    for (const [language, langData] of Object.entries(data.languages)) {
      for (const entry of langData.entries) {
        map.set(entry.textId, getAudioUrl(label, language, entry.fileName))
      }
    }
    return map
  }, [data, label])

  return { audioMap, hasTTS: audioMap.size > 0 }
}
