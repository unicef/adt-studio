import { useQuery } from "@tanstack/react-query"
import { api } from "@/api/client"

export function usePreset(name: string | null) {
  return useQuery({
    queryKey: ["preset", name],
    queryFn: () => api.getPreset(name!),
    enabled: !!name,
  })
}

export function useStyleguides() {
  return useQuery({
    queryKey: ["styleguides"],
    queryFn: api.getStyleguides,
  })
}

export function useTemplates() {
  return useQuery({
    queryKey: ["templates"],
    queryFn: api.getTemplates,
  })
}

export function useStyleguidePreview(name: string | null) {
  return useQuery({
    queryKey: ["styleguide-preview", name],
    queryFn: () => api.getStyleguidePreview(name!),
    enabled: !!name,
  })
}

export function useGlobalConfig() {
  return useQuery({
    queryKey: ["global-config"],
    queryFn: api.getGlobalConfig,
  })
}
