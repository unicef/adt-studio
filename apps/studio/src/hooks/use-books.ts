import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api, BASE_URL } from "@/api/client"

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

export function useExportBook() {
  return useMutation({
    mutationFn: (label: string) => api.exportBook(label),
    onSuccess: async (blob, label) => {
      if (BASE_URL.startsWith("http")) {
        // Tauri mode: programmatic blob-URL anchor clicks don't trigger file system
        // downloads in WebView2 (async click loses the user-gesture context).
        // Use native OS save dialog + fs write instead (see Lesson #10).
        try {
          const { save } = await import("@tauri-apps/plugin-dialog")
          const { writeFile } = await import("@tauri-apps/plugin-fs")
          const savePath = await save({
            defaultPath: `${label}.zip`,
            filters: [{ name: "ZIP Archive", extensions: ["zip"] }],
          })
          if (savePath) {
            const buf = await blob.arrayBuffer()
            await writeFile(savePath, new Uint8Array(buf))
          }
        } catch (err) {
          console.error("Export failed:", err)
          throw err // Re-throw so TanStack Query marks the mutation as failed
        }
      } else {
        // Local dev / browser: standard anchor-click download
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = `${label}.zip`
        document.body.appendChild(a)
        a.click()
        setTimeout(() => {
          document.body.removeChild(a)
          URL.revokeObjectURL(url)
        }, 1500)
      }
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
