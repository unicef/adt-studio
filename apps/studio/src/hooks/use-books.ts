import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "@/api/client"

export function useBooks() {
  return useQuery({
    queryKey: ["books"],
    queryFn: api.getBooks,
  })
}

export function useBook(label: string) {
  return useQuery({
    queryKey: ["books", label],
    queryFn: () => api.getBook(label),
    enabled: !!label,
  })
}

export function useCreateBook() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      label,
      pdf,
      config,
    }: {
      label: string
      pdf: File
      config?: Record<string, unknown>
    }) => api.createBook(label, pdf, config),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["books"] })
    },
  })
}

export function useDeleteBook() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (label: string) => api.deleteBook(label),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["books"] })
    },
  })
}

export function useAcceptStoryboard() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (label: string) => api.acceptStoryboard(label),
    onSuccess: (_data, label) => {
      queryClient.invalidateQueries({ queryKey: ["pipeline-status", label] })
      queryClient.invalidateQueries({ queryKey: ["books"] })
      queryClient.invalidateQueries({ queryKey: ["books", label] })
    },
  })
}

export function useExportBook() {
  return useMutation({
    mutationFn: ({ label, format }: { label: string; format: "web" | "epub" }) =>
      api.exportBook(label, format),
    onSuccess: (blob, { label, format }) => {
      const ext = format === "epub" ? ".epub" : ".zip"
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `${label}${ext}`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    },
  })
}

export function usePackageAdt() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (label: string) => api.packageAdt(label),
    onSuccess: (_data, label) => {
      queryClient.invalidateQueries({ queryKey: ["package-adt-status", label] })
    },
  })
}

export function usePackageAdtStatus(label: string) {
  return useQuery({
    queryKey: ["package-adt-status", label],
    queryFn: () => api.getPackageAdtStatus(label),
    enabled: !!label,
  })
}
