import { useQuery } from "@tanstack/react-query"
import { api } from "@/api/client"

export function useEasyRead(label: string) {
  return useQuery({
    queryKey: ["books", label, "easy-read"],
    queryFn: () => api.getEasyRead(label),
    enabled: !!label,
  })
}

/** Raw TTS payload — `useTTS` only exposes the textId → URL lookup. */
export function useSpeech(label: string) {
  return useQuery({
    queryKey: ["books", label, "tts"],
    queryFn: () => api.getTTS(label),
    enabled: !!label,
  })
}

export function useTextCatalog(label: string) {
  return useQuery({
    queryKey: ["books", label, "text-catalog"],
    queryFn: () => api.getTextCatalog(label),
    enabled: !!label,
  })
}

/** Sections a TOC entry can link to — only worth fetching once the TOC exists. */
export function useTocSections(label: string, enabled: boolean) {
  return useQuery({
    queryKey: ["books", label, "toc-sections"],
    queryFn: () => api.getTocSections(label),
    enabled: !!label && enabled,
  })
}
