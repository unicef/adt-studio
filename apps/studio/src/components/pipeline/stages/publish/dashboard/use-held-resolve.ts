import { useCallback, useEffect, useMemo, useRef, useState } from "react"

/** How long a resolved thread stays in place offering Undo before it is actually resolved. */
export const UNDO_WINDOW_MS = 4000

/**
 * Resolve with a grace period. `hold(id)` marks a thread as resolved *on screen* at once and
 * sends the real resolve when the window closes; `undo(id)` inside the window cancels it. The
 * thread stays marked until the service has answered, so it never flickers back to waiting in
 * between; if the service refuses, it returns to waiting and lands in `failed`. A held thread is
 * committed immediately if the component unmounts, so leaving the page never loses a resolve.
 */
export function useHeldResolve(resolve: (id: string, resolved: boolean) => Promise<void>) {
  const [held, setHeld] = useState<ReadonlySet<string>>(new Set())
  const [committing, setCommitting] = useState<ReadonlySet<string>>(new Set())
  const [failed, setFailed] = useState<ReadonlySet<string>>(new Set())
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const resolveRef = useRef(resolve)
  resolveRef.current = resolve

  const commit = useCallback((id: string) => {
    setHeld(without(id))
    setCommitting((current) => new Set(current).add(id))
    resolveRef.current(id, true).then(
      () => setCommitting(without(id)),
      () => {
        setCommitting(without(id))
        setFailed((current) => new Set(current).add(id))
      },
    )
  }, [])

  const hold = useCallback(
    (id: string) => {
      if (timers.current.has(id)) return
      setFailed(without(id))
      setHeld((current) => new Set(current).add(id))
      timers.current.set(
        id,
        setTimeout(() => {
          timers.current.delete(id)
          commit(id)
        }, UNDO_WINDOW_MS),
      )
    },
    [commit],
  )

  const undo = useCallback((id: string) => {
    clearTimeout(timers.current.get(id))
    timers.current.delete(id)
    setHeld(without(id))
  }, [])

  useEffect(() => {
    const pending = timers.current
    return () => {
      for (const [id, timer] of pending) {
        clearTimeout(timer)
        void resolveRef.current(id, true).catch(() => undefined)
      }
      pending.clear()
    }
  }, [])

  /** Everything shown as resolved right now: inside the undo window or on its way. */
  const marked = useMemo<ReadonlySet<string>>(() => new Set([...held, ...committing]), [held, committing])
  return { held: marked, failed, hold, undo, isHeld: (id: string) => marked.has(id) }
}

function without(id: string) {
  return (current: ReadonlySet<string>): ReadonlySet<string> => {
    if (!current.has(id)) return current
    const next = new Set(current)
    next.delete(id)
    return next
  }
}
