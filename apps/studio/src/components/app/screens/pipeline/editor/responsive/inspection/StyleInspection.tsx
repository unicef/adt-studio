import { createContext, useContext, useLayoutEffect, useMemo, useState, type ReactNode } from "react"
import { useDocument, useSelectedIds } from "adt-html-editor"
import type { styleEntry } from "./styleChanges"

export interface StylePreview {
  entries: ReturnType<typeof styleEntry>[]
  point: { x: number; y: number }
  bounds?: { left: number; top: number; right: number; bottom: number }
}

const InspectionContext = createContext<{ preview: StylePreview | null } | null>(null)
const PreviewContext = createContext<(preview: StylePreview | null) => void>(() => {})

// UI-only state scoped to this editor. It never becomes part of the document,
// history or saved book. Consumers of the stable reporter do not rerender on moves.
export function StyleInspection({ children }: { children: ReactNode }) {
  const doc = useDocument()
  const selected = useSelectedIds()
  const [preview, setPreview] = useState<StylePreview | null>(null)
  useLayoutEffect(() => {
    setPreview(null)
  }, [doc, selected])
  const value = useMemo(() => ({ preview }), [preview])
  return <PreviewContext.Provider value={setPreview}><InspectionContext.Provider value={value}>{children}</InspectionContext.Provider></PreviewContext.Provider>
}

export const useStyleInspection = () => useContext(InspectionContext)
export const useStylePreview = () => useContext(PreviewContext)
