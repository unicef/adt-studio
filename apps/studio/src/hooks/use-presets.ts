import { useQuery } from "@tanstack/react-query"
import { api } from "@/api/client"

export function usePreset(name: string | null) {
  return useQuery({
    queryKey: ["preset", name],
    queryFn: () => api.getPreset(name!),
    enabled: !!name,
  })
}

export function useGlobalConfig() {
  return useQuery({
    queryKey: ["global-config"],
    queryFn: api.getGlobalConfig,
  })
}
