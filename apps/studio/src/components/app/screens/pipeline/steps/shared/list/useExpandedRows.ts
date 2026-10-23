import { useCallback, useState } from "react"

export function useExpandedRows() {
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set())
  const toggle = useCallback(
    (key: string) =>
      setOpen((previous) => {
        const next = new Set(previous)
        if (next.has(key)) next.delete(key)
        else next.add(key)
        return next
      }),
    [],
  )
  const expand = useCallback((key: string) => setOpen((previous) => (previous.has(key) ? previous : new Set([...previous, key]))), [])
  const replace = useCallback((keys: Iterable<string>) => setOpen(new Set(keys)), [])
  return { open, toggle, expand, replace }
}
