import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "@/api/client"

export function useSignLanguageVideos(label: string) {
  return useQuery({
    queryKey: ["books", label, "sign-language-videos"],
    queryFn: () => api.getSignLanguageVideos(label),
    enabled: !!label,
  })
}

export function useUploadSignLanguageVideo(label: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (file: File) => api.uploadSignLanguageVideo(label, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["books", label, "sign-language-videos"] })
    },
  })
}

export function useAssignSignLanguageVideo(label: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ videoId, sectionId }: { videoId: string; sectionId: string | null }) =>
      api.assignSignLanguageVideo(label, videoId, sectionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["books", label, "sign-language-videos"] })
    },
  })
}

export function useDeleteSignLanguageVideo(label: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (videoId: string) => api.deleteSignLanguageVideo(label, videoId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["books", label, "sign-language-videos"] })
    },
  })
}
