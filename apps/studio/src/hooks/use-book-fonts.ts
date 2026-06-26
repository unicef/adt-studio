import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api, type ApplyBookFontPayload } from "@/api/client"
import type { BookFontRole } from "@adt/types"

export function useGoogleFontsCatalog(enabled: boolean) {
  return useQuery({
    queryKey: ["google-fonts-catalog"],
    queryFn: api.getGoogleFontsCatalog,
    staleTime: Infinity,
    enabled,
  })
}

export function useBookFonts(label: string, opts?: { refetchInterval?: number | false }) {
  return useQuery({
    queryKey: ["book-fonts", label],
    queryFn: () => api.getBookFonts(label),
    refetchInterval: opts?.refetchInterval ?? false,
  })
}

function useInvalidateBookFonts(label: string) {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: ["book-fonts", label] })
}

export function useUploadBookFonts(label: string) {
  const invalidate = useInvalidateBookFonts(label)
  return useMutation({
    mutationFn: (files: File[]) => api.uploadBookFonts(label, files),
    onSuccess: invalidate,
  })
}

export function useAddGoogleFont(label: string) {
  const invalidate = useInvalidateBookFonts(label)
  return useMutation({
    mutationFn: (family: string) => api.addGoogleFont(label, family),
    onSuccess: invalidate,
  })
}

export function useUpdateBookFont(label: string) {
  const invalidate = useInvalidateBookFonts(label)
  return useMutation({
    mutationFn: ({
      fontId,
      ...data
    }: {
      fontId: string
      family?: string
      role?: BookFontRole
      roleLockedByUser?: boolean
    }) => api.updateBookFont(label, fontId, data),
    onSuccess: invalidate,
  })
}

export function useDeleteBookFont(label: string) {
  const invalidate = useInvalidateBookFonts(label)
  return useMutation({
    mutationFn: (fontId: string) => api.deleteBookFont(label, fontId),
    onSuccess: invalidate,
  })
}

export function useAnalyzeBookFonts(label: string) {
  return useMutation({
    mutationFn: (apiKey: string) => api.analyzeBookFonts(label, apiKey),
  })
}

export function useApplyBookFont(label: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: ApplyBookFontPayload) => api.applyBookFont(label, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["book-fonts", label] })
      queryClient.invalidateQueries({ queryKey: ["books", label, "pages"] })
      queryClient.invalidateQueries({ queryKey: ["book-config", label] })
      queryClient.invalidateQueries({ queryKey: ["debug", "config", label] })
    },
  })
}
