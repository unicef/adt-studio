import { useCallback, useMemo, useRef, useState, type SetStateAction } from "react"
import { ApiError } from "@/api/client"
import { rebaseDraft } from "@/lib/rebase-draft"

/** Capture the version when editing starts, never from a later query refresh. */
export function useGuardedDraft<T>(current: T | null | undefined, version: number | null | undefined, reload: () => Promise<{ value: T; version: number; companionVersion?: number }>, companionVersion?: number) {
  const [pending, update] = useState<T | null>(null)
  const base = useRef<{ value: T; version: number; companionVersion?: number } | null>(null)
  const generation = useRef(0)
  const epoch = useRef(0)
  const pendingRef = useRef(pending)
  const currentRef = useRef({ current, version, reload, companionVersion })
  currentRef.current = { current, version, reload, companionVersion }
  const [conflict, setConflict] = useState<{ mine: T; latest: T; paths: string[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const setPending = useCallback((action: SetStateAction<T | null>) => {
    epoch.current++
    const { current, version, companionVersion } = currentRef.current
    if (!base.current && current) base.current = { value: structuredClone(current), version: version ?? 0, companionVersion }
    const next = typeof action === "function" ? (action as (v: T | null) => T | null)(pendingRef.current) : action
    if (next === null) { generation.current++; base.current = null; setConflict(null); setError(null) }
    pendingRef.current = next
    update(next)
  }, [])
  const handleError = useCallback(async (failure: unknown, draft = pendingRef.current) => {
    setError(failure instanceof Error ? failure.message : String(failure))
    if (!(failure instanceof ApiError) || failure.status !== 409 || !base.current || !draft) return
    const before = base.current
    const revision = epoch.current
    let latest: { value: T; version: number; companionVersion?: number }
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
  // An acknowledgement belongs to the draft generation that submitted it.
  // New typing is retained; discard/navigation makes a late response inert.
  const captureSave = useCallback((value = pendingRef.current) => ({ value, generation: generation.current, revision: epoch.current }), [])
  const isCurrentSave = useCallback((ticket: ReturnType<typeof captureSave>) => ticket.generation === generation.current, [])
  const completeSave = useCallback((ticket: ReturnType<typeof captureSave>, _version: number, _companionVersion?: number) => {
    if (ticket.generation !== generation.current || !ticket.value) return false
    if (ticket.revision === epoch.current) {
      setPending(null)
      return true
    }
    // The server may have deterministically changed the companion rendering.
    // Versions alone do not give us that new base value. Retain the original
    // guards so a retry refreshes/rebases through the existing conflict path,
    // rather than blessing a newer draft against an unseen committed snapshot.
    return false
  }, [setPending])
  const baseVersion = base.current?.version ?? version ?? 0
  const baseCompanionVersion = base.current?.companionVersion ?? companionVersion ?? 0
  return useMemo(() => ({ pending, setPending, baseVersion, baseCompanionVersion, captureSave, completeSave, isCurrentSave, handleError, conflict, resolve, error }), [pending, setPending, baseVersion, baseCompanionVersion, captureSave, completeSave, isCurrentSave, handleError, conflict, resolve, error])
}
