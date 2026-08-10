import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "@/api/client"

export function useStyleguides(bookLabel?: string) {
  return useQuery({
    queryKey: ["styleguides", bookLabel ?? null],
    queryFn: () => api.getStyleguides(bookLabel),
  })
}

export function useTemplates() {
  return useQuery({
    queryKey: ["templates"],
    queryFn: api.getTemplates,
  })
}

export function useStyleguidePreview(name: string | null, bookLabel?: string) {
  return useQuery({
    queryKey: ["styleguide-preview", name, bookLabel ?? null],
    queryFn: () => api.getStyleguidePreview(name!, bookLabel),
    enabled: !!name,
  })
}

export function useGenerateStyleguide() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ label, pageIds, apiKey }: { label: string; pageIds: string[]; apiKey: string }) =>
      api.generateStyleguide(label, pageIds, apiKey),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["styleguides"] })
      queryClient.invalidateQueries({ queryKey: ["styleguide-preview", data.name] })
    },
  })
}

export function useUploadStyleguide() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (file: File) => api.uploadStyleguide(file),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["styleguides"] })
      queryClient.invalidateQueries({ queryKey: ["styleguide-preview", data.name] })
    },
  })
}

export function useGlobalConfig() {
  return useQuery({
    queryKey: ["global-config"],
    queryFn: api.getGlobalConfig,
  })
}
