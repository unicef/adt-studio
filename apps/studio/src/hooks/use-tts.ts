import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { api, getAudioUrl } from "@/api/client"

/** Shared current speech evidence for playback and optional-output attention. */
export function useTTSData(label: string) {
  return useQuery({
    queryKey: ["books", label, "tts"],
    queryFn: () => api.getTTS(label),
    enabled: !!label,
  })
}

/** Current textId → audio URL lookup for playback. */
export function useTTS(label: string) {
  const { data } = useTTSData(label)
  const audioMap = useMemo(() => {
    const map = new Map<string, string>()
    if (!data?.languages) return map
    for (const [language, langData] of Object.entries(data.languages)) {
      for (const entry of langData.entries) {
        map.set(entry.textId, getAudioUrl(label, language, entry.fileName, entry.cacheKey))
      }
    }
    return map
  }, [data, label])

  return { audioMap, hasTTS: audioMap.size > 0 }
}
