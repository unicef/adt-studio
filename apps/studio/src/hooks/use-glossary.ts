import { useQuery } from "@tanstack/react-query"
import { api } from "@/api/client"

export function useGlossary(label: string) {
  return useQuery({
    queryKey: ["books", label, "glossary"],
    queryFn: () => api.getGlossary(label),
    enabled: !!label,
  })
}
