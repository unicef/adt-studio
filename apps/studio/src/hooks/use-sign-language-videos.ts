import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "@/api/client"

function refreshVideoDataAndPreview(
  queryClient: ReturnType<typeof useQueryClient>,
  label: string,
) {
  void queryClient.invalidateQueries({
    queryKey: ["books", label, "sign-language-videos"],
  })
  void queryClient.invalidateQueries({
    queryKey: ["package-adt-status", label],
  })
  window.dispatchEvent(new CustomEvent("adt:repackage"))
}

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
      refreshVideoDataAndPreview(queryClient, label)
    },
  })
}

export function useAssignSignLanguageVideo(label: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ videoId, sectionId }: { videoId: string; sectionId: string | null }) =>
      api.assignSignLanguageVideo(label, videoId, sectionId),
    onSuccess: () => {
      refreshVideoDataAndPreview(queryClient, label)
    },
  })
}

export function useDeleteSignLanguageVideo(label: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (videoId: string) => api.deleteSignLanguageVideo(label, videoId),
    onSuccess: () => {
      refreshVideoDataAndPreview(queryClient, label)
    },
  })
}
