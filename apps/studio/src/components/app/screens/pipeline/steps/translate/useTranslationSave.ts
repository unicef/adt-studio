import { useCallback, useEffect, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { api, type TextCatalogResponse } from "@/api/client"
import { entriesFor, patchCatalog } from "./translateState"

export type RowSaveState = "saving" | "saved" | "failed"

export interface RowSave {
  state: RowSaveState
  previous: string
  text: string
}

export interface TranslationSave {
  rows: ReadonlyMap<string, RowSave>
  error: Error | null
  save: (id: string, text: string, previous: string) => void
  undo: (id: string) => void
  retry: (id: string) => void
}

const SAVED_FOR_MS = 6000

export function useTranslationSave(label: string, language: string, isBase: boolean): TranslationSave {
  const queryClient = useQueryClient()
  const key = useRef(["books", label, "text-catalog"] as const)
  key.current = ["books", label, "text-catalog"] as const
  const [rows, setRows] = useState<ReadonlyMap<string, RowSave>>(() => new Map())
  const [error, setError] = useState<Error | null>(null)
  const chain = useRef<Promise<unknown>>(Promise.resolve())
  const pending = useRef(0)
  const timers = useRef(new Map<string, number>())

  useEffect(() => {
    const owned = timers.current
    setRows(new Map())
    setError(null)
    return () => {
      for (const timer of owned.values()) window.clearTimeout(timer)
      owned.clear()
    }
  }, [language])

  const setRow = useCallback((id: string, next: RowSave | null) => {
    setRows((current) => {
      const map = new Map(current)
      if (next) map.set(id, next)
      else map.delete(id)
      return map
    })
  }, [])

  const settle = useCallback(() => {
    pending.current -= 1
    if (pending.current > 0) return
    void queryClient.invalidateQueries({ queryKey: key.current })
    void queryClient.invalidateQueries({ queryKey: ["books", label, "tts"] })
    void queryClient.invalidateQueries({ queryKey: ["books", label, "step-status"] })
    void queryClient.invalidateQueries({ queryKey: ["evaluations", "translations", label] })
  }, [queryClient, label])

  const save = useCallback(
    (id: string, text: string, previous: string) => {
      const before = timers.current.get(id)
      if (before) window.clearTimeout(before)
      timers.current.delete(id)
      queryClient.setQueryData<TextCatalogResponse | null>(key.current, (current) =>
        current ? patchCatalog(current, language, isBase, id, text) : current,
      )
      const entries = entriesFor(queryClient.getQueryData<TextCatalogResponse | null>(key.current), language, isBase)
      setRow(id, { state: "saving", previous, text })
      setError(null)
      pending.current += 1
      chain.current = chain.current
        .catch(() => undefined)
        .then(() => api.updateTranslation(label, language, { entries }))
        .then(
          () => {
            setRow(id, { state: "saved", previous, text })
            timers.current.set(
              id,
              window.setTimeout(() => {
                timers.current.delete(id)
                setRow(id, null)
              }, SAVED_FOR_MS),
            )
          },
          (failure: unknown) => {
            setRow(id, { state: "failed", previous, text })
            setError(failure instanceof Error ? failure : new Error(String(failure)))
          },
        )
        .finally(settle)
    },
    [queryClient, label, language, isBase, setRow, settle],
  )

  const undo = useCallback(
    (id: string) => {
      const row = rows.get(id)
      if (!row) return
      save(id, row.previous, row.text)
      const timer = timers.current.get(id)
      if (timer) window.clearTimeout(timer)
    },
    [rows, save],
  )

  const retry = useCallback(
    (id: string) => {
      const row = rows.get(id)
      if (row) save(id, row.text, row.previous)
    },
    [rows, save],
  )

  return { rows, error, save, undo, retry }
}
