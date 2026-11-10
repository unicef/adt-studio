import { useCallback, useRef, useState, type Ref } from "react"

export interface SectionMore {
  open: boolean
  onMore: () => void
  buttonRef: Ref<HTMLButtonElement>
}

export function useInspectorSheet<K extends string>(initial: K) {
  const [openKind, setOpenKind] = useState<K | null>(null)
  const [shownKind, setShownKind] = useState<K>(initial)
  const triggers = useRef<Partial<Record<K, HTMLButtonElement | null>>>({})

  const close = useCallback(() => {
    if (openKind) {
      const trigger = triggers.current[openKind]
      requestAnimationFrame(() => trigger?.focus({ preventScroll: true }))
    }
    setOpenKind(null)
  }, [openKind])

  const show = useCallback((kind: K) => {
    setShownKind(kind)
    setOpenKind(kind)
  }, [])

  const more = (kind: K): SectionMore => ({
    open: openKind === kind,
    buttonRef: (element) => {
      triggers.current[kind] = element
    },
    onMore: () => show(kind),
  })

  return { open: openKind != null, openKind, shownKind, close, show, more }
}
