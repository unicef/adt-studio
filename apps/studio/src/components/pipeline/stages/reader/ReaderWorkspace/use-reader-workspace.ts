import { useCallback, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { ReaderSourceCompileError } from "@adt/types"
import { api } from "@/api/client"

export interface RevealTarget {
  path: string
  line: number
  nonce: number
}

export function readerSourcePrefix(label: string | null): string {
  return label ? `/books/${label}/reader-source` : "/reader-source/global"
}

export function readerSourceKey(label: string | null): string[] {
  return label ? ["books", label, "reader-source"] : ["reader-source-global"]
}

export function tabAfterClose(tabs: string[], closing: string, active: string | null): string | null {
  if (closing !== active) return active
  const index = tabs.indexOf(closing)
  const rest = tabs.filter((path) => path !== closing)
  return rest[index] ?? rest[index - 1] ?? null
}

export function useReaderWorkspace(label: string | null) {
  const queryClient = useQueryClient()
  const prefix = readerSourcePrefix(label)
  const key = readerSourceKey(label)
  const [selected, setSelected] = useState<string | null>(null)
  const [tabs, setTabs] = useState<string[]>([])
  const [previewActive, setPreviewActive] = useState(label !== null)
  const [buffers, setBuffers] = useState<Record<string, string>>({})
  const [compileErrors, setCompileErrors] = useState<ReaderSourceCompileError[]>([])
  const [reveal, setReveal] = useState<RevealTarget | null>(null)
  const [error, setError] = useState<string | null>(null)

  const tree = useQuery({ queryKey: [...key, "tree"], queryFn: () => api.readerSourceTree(prefix) })
  const file = useQuery({
    queryKey: [...key, "file", selected],
    queryFn: () => api.readerSourceFile(prefix, selected ?? ""),
    enabled: selected !== null,
  })

  const refresh = () => queryClient.invalidateQueries({ queryKey: key })
  const dropBuffer = (path: string) =>
    setBuffers((current) => {
      const { [path]: _dropped, ...rest } = current
      return rest
    })
  const onError = (err: unknown) => setError(err instanceof Error ? err.message : String(err))

  const save = useMutation({
    mutationFn: (path: string) =>
      api.saveReaderSource(prefix, { path, content: buffers[path] ?? "", baseVersion: file.data?.headVersion ?? null }),
    onMutate: () => setError(null),
    onSuccess: (_result, path) => {
      dropBuffer(path)
      void refresh()
    },
    onError,
  })

  const revert = useMutation({
    mutationFn: (path: string) => api.revertReaderSource(prefix, { path, baseVersion: file.data?.headVersion ?? null }),
    onMutate: () => setError(null),
    onSuccess: (_result, path) => {
      dropBuffer(path)
      void refresh()
    },
    onError,
  })

  const restore = useMutation({
    mutationFn: ({ path, version }: { path: string; version: number }) =>
      api.restoreReaderSource(prefix, { path, version, baseVersion: file.data?.headVersion ?? null }),
    onMutate: () => setError(null),
    onSuccess: (_result, { path }) => {
      dropBuffer(path)
      void refresh()
    },
    onError,
  })

  const followGlobal = useMutation({
    mutationFn: () => api.followGlobalReader(label ?? ""),
    onMutate: () => setError(null),
    onSuccess: () => {
      setBuffers({})
      void refresh()
    },
    onError,
  })

  const setContent = useCallback(
    (value: string) => {
      if (!selected) return
      if (value === file.data?.content) dropBuffer(selected)
      else setBuffers((current) => ({ ...current, [selected]: value }))
    },
    [file.data?.content, selected],
  )

  const open = useCallback((path: string, line?: number) => {
    setTabs((current) => (current.includes(path) ? current : [...current, path]))
    setSelected(path)
    setPreviewActive(false)
    if (line) setReveal({ path, line, nonce: Date.now() })
  }, [])

  const close = (path: string) => {
    const next = tabAfterClose(tabs, path, selected)
    setTabs(tabs.filter((tab) => tab !== path))
    setSelected(next)
    if (!next) setPreviewActive(label !== null)
  }

  return {
    label,
    prefix,
    key,
    tree,
    file,
    selected,
    open,
    tabs,
    close,
    previewActive,
    showPreview: () => setPreviewActive(true),
    content: selected ? (buffers[selected] ?? file.data?.content ?? "") : "",
    setContent,
    buffers,
    discard: () => selected && dropBuffer(selected),
    save,
    revert,
    restore,
    followGlobal,
    compileErrors,
    setCompileErrors,
    reveal,
    error,
    setError,
  }
}

export type ReaderWorkspaceState = ReturnType<typeof useReaderWorkspace>
