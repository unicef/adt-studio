import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type SyntheticEvent } from "react"

/** Restore temporarily changes the editor's baseline, unlike an ordinary save. */
export function useVersionRestoreBusy(scope: string) {
  const [restoring, setRestoring] = useState(false)
  const restoringRef = useRef(false)
  // Identity also distinguishes leaving and returning to the same scope.
  const scopeToken = useMemo(() => ({ scope }), [scope])
  const scopeRef = useRef(scopeToken)
  if (scopeRef.current !== scopeToken) {
    scopeRef.current = scopeToken
    restoringRef.current = false
  }
  useEffect(() => { setRestoring(false) }, [scopeToken])
  const onRestoringChange = useCallback((next: boolean) => {
    if (scopeRef.current !== scopeToken || (next && restoringRef.current)) return false
    restoringRef.current = next
    setRestoring(next)
    return true
  }, [scopeToken])
  const isCurrent = useCallback(() => scopeRef.current === scopeToken, [scopeToken])
  return { restoring, restoringRef, onRestoringChange, isCurrent }
}

/** Native controls and React portals share the same temporary interaction gate.
 * Owners also guard their mutation callbacks; an iframe needs editable=false. */
export function EditorBusyBoundary({ busy, children }: { busy: boolean; children: ReactNode }) {
  const block = (event: SyntheticEvent) => {
    if (!busy) return
    event.preventDefault()
    event.stopPropagation()
  }
  return (
    <fieldset
      disabled={busy}
      inert={busy || undefined}
      aria-busy={busy || undefined}
      className="contents"
      onClickCapture={block}
      onPointerDownCapture={block}
      onKeyDownCapture={block}
      onBeforeInputCapture={block}
      onChangeCapture={block}
      onSubmitCapture={block}
    >
      {children}
    </fieldset>
  )
}
