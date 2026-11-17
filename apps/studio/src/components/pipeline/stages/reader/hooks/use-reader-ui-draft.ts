import { useCallback, useMemo, useState } from "react"
import {
  hasReaderUiCustomization,
  resolveReaderUiLayout,
  type ReaderColorToken,
  type ReaderFont,
  type ReaderUi,
  type ReaderUiLayout,
} from "@adt/types"
import { useBookConfig, useUpdateBookConfig } from "@/hooks/use-book-config"
import { normalizeReaderUi, sameReaderUi } from "../lib/normalize"

export type ReaderColorMode = "light" | "dark"


export interface ReaderUiDraft {
  isLoading: boolean
  /** What the editor shows and the preview renders. */
  value: ReaderUi
  layout: Required<ReaderUiLayout>
  dirty: boolean
  isSaving: boolean
  saveError: string | null
  replace: (next: ReaderUi) => void
  setLayout: <K extends keyof ReaderUiLayout>(key: K, value: Required<ReaderUiLayout>[K]) => void
  setColor: (mode: ReaderColorMode, token: ReaderColorToken, value: string | undefined) => void
  setRadius: (radius: number | undefined) => void
  setFont: (font: ReaderFont) => void
  /** Back to the runtime defaults (still needs a save). */
  resetToDefaults: () => void
  /** Throw away unsaved edits. */
  discard: () => void
  save: () => void
}

/**
 * Editable copy of the book's `reader_ui`. Edits stay local (and drive the
 * live preview) until saved into the book config, which is what packaging
 * reads — so exports and the Preview step pick the design up on their next
 * package.
 */
export function useReaderUiDraft(bookLabel: string): ReaderUiDraft {
  const { data, isLoading } = useBookConfig(bookLabel)
  const updateConfig = useUpdateBookConfig()
  const saved = useMemo<ReaderUi>(
    () => ((data?.config?.reader_ui as ReaderUi | undefined) ?? {}),
    [data],
  )
  const [draft, setDraft] = useState<ReaderUi | null>(null)
  const value = draft ?? saved
  const dirty = draft !== null && !sameReaderUi(draft, saved)

  const edit = useCallback(
    (fn: (current: ReaderUi) => ReaderUi) => setDraft((prev) => fn(prev ?? saved)),
    [saved],
  )

  const setLayout = useCallback<ReaderUiDraft["setLayout"]>(
    (key, next) => edit((ui) => ({ ...ui, layout: { ...resolveReaderUiLayout(ui.layout), [key]: next } })),
    [edit],
  )

  const setColor = useCallback<ReaderUiDraft["setColor"]>(
    (mode, token, next) =>
      edit((ui) => {
        const tokens = { ...(ui[mode] ?? {}) }
        if (next === undefined) delete tokens[token]
        else tokens[token] = next
        return { ...ui, [mode]: tokens }
      }),
    [edit],
  )

  const save = useCallback(() => {
    if (!draft) return
    const base = { ...(data?.config ?? {}) }
    const normalized = normalizeReaderUi(draft)
    if (hasReaderUiCustomization(normalized)) base.reader_ui = normalized
    else delete base.reader_ui
    // The draft is kept: once the refetched config matches it, `dirty` clears
    // on its own, and the preview never flashes back to the old design.
    updateConfig.mutate({ label: bookLabel, config: base })
  }, [bookLabel, data, draft, updateConfig])

  return {
    isLoading,
    value,
    layout: resolveReaderUiLayout(value.layout),
    dirty,
    isSaving: updateConfig.isPending,
    saveError: updateConfig.error instanceof Error ? updateConfig.error.message : null,
    replace: (next) => setDraft(next),
    setLayout,
    setColor,
    setRadius: (radius) => edit((ui) => ({ ...ui, radius })),
    setFont: (font) => edit((ui) => ({ ...ui, font })),
    resetToDefaults: () => setDraft({}),
    discard: () => setDraft(null),
    save,
  }
}
