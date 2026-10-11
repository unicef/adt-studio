import { useCallback, useMemo, useRef, useState, type SetStateAction } from "react"
import { ApiError } from "@/api/client"
import { rebaseDraft } from "@/lib/rebase-draft"

/** Capture the version when editing starts, never from a later query refresh. */
export function useGuardedDraft<T>(current: T | null | undefined, version: number | null | undefined, reload: () => Promise<{ value: T; version: number }>) {
  const [pending, update] = useState<T | null>(null)
  const base = useRef<{ value: T; version: number } | null>(null)
  const epoch = useRef(0)
  const pendingRef = useRef(pending)
  const currentRef = useRef({ current, version, reload })
  currentRef.current = { current, version, reload }
  const [conflict, setConflict] = useState<{ mine: T; latest: T; paths: string[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const setPending = useCallback((action: SetStateAction<T | null>) => {
    epoch.current++
    const { current, version } = currentRef.current
    if (!base.current && current) base.current = { value: structuredClone(current), version: version ?? 0 }
    const next = typeof action === "function" ? (action as (v: T | null) => T | null)(pendingRef.current) : action
    if (next === null) { base.current = null; setConflict(null); setError(null) }
    pendingRef.current = next
    update(next)
  }, [])
  const handleError = useCallback(async (failure: unknown, draft = pendingRef.current) => {
    setError(failure instanceof Error ? failure.message : String(failure))
    if (!(failure instanceof ApiError) || failure.status !== 409 || !base.current || !draft) return
    const before = base.current
    const revision = epoch.current
    let latest: { value: T; version: number }
    try { latest = await currentRef.current.reload() } catch (reloadError) {
      if (revision === epoch.current) setError(reloadError instanceof Error ? reloadError.message : String(reloadError))
      return
    }
    if (revision !== epoch.current) return
    const mine = rebaseDraft(before.value, draft, latest.value)
    const theirs = rebaseDraft(before.value, draft, latest.value, "latest")
    base.current = latest
    pendingRef.current = mine.value
    update(mine.value)
    setConflict(mine.conflicts.length ? { mine: mine.value, latest: theirs.value, paths: mine.conflicts } : null)
  }, [])
  const resolve = useCallback((choice: "draft" | "latest") => {
    if (!conflict) return
    // The editor stays usable while a conflict is shown. Apply the choice to
    // that conflict without dropping unrelated edits typed since it appeared.
    const selected = choice === "draft" ? conflict.mine : conflict.latest
    pendingRef.current = rebaseDraft(conflict.mine, pendingRef.current ?? conflict.mine, selected, choice).value
    epoch.current++
    update(pendingRef.current)
    setConflict(null)
    setError(null)
  }, [conflict])
  const baseVersion = base.current?.version ?? version ?? 0
  return useMemo(() => ({ pending, setPending, baseVersion, handleError, conflict, resolve, error }), [pending, setPending, baseVersion, handleError, conflict, resolve, error])
}
