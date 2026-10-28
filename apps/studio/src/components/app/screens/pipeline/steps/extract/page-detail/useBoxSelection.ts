import { useCallback, useEffect, useState } from "react"

export function useBoxSelection() {
  const [hoverId, setHoverId] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const select = useCallback((imageId: string) => setSelectedId((current) => (current === imageId ? null : imageId)), [])
  const clear = useCallback(() => setSelectedId(null), [])

  useEffect(() => {
    if (!selectedId) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      if (event.defaultPrevented) return
      if (event.target instanceof Element && event.target.closest("[role=dialog]")) return
      event.preventDefault()
      setSelectedId(null)
    }
    window.addEventListener("keydown", onKey, true)
    return () => window.removeEventListener("keydown", onKey, true)
  }, [selectedId])

  return { hoverId, selectedId, activeId: hoverId ?? selectedId, hover: setHoverId, select, clear }
}

export type BoxSelection = ReturnType<typeof useBoxSelection>
