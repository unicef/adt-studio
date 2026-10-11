import { useCallback, useRef, type SetStateAction } from "react"
import { api, type PageDetail } from "@/api/client"
import { useQueryClient } from "@tanstack/react-query"
import { useGuardedDraft } from "./use-guarded-draft"

type Source = NonNullable<PageDetail["sectioningTree"]>
type Rendering = NonNullable<PageDetail["rendering"]>

/** Keep both inputs to an atomic Storyboard save pinned to the editing snapshot. */
export function useStoryboardDraft(bookLabel: string, pageId: string, page: PageDetail) {
  const queryClient = useQueryClient()
  const sourceEdited = useRef(false)
  const renderingEdited = useRef(false)
  const current = { sectioning: page.sectioningTree, rendering: page.rendering }
  const draft = useGuardedDraft(current, page.versions.sectioning, async () => {
    const latest = await api.getPage(bookLabel, pageId)
    queryClient.setQueryData(["books", bookLabel, "pages", pageId], latest)
    return {
      value: { sectioning: latest.sectioningTree, rendering: latest.rendering },
      version: latest.versions.sectioning ?? 0,
      companionVersion: latest.versions.rendering ?? 0,
    }
  }, page.versions.rendering ?? 0)
  const identity = `${bookLabel}:${pageId}`
  const activeIdentity = useRef(identity)
  if (activeIdentity.current !== identity) {
    activeIdentity.current = identity
    sourceEdited.current = false
    renderingEdited.current = false
    draft.setPending(null)
  }
  const state = useRef({ current, draft })
  state.current = { current, draft }
  const setSectioning = useCallback((action: SetStateAction<Source | null>) => {
    const { current, draft } = state.current
    const before = sourceEdited.current ? draft.pending?.sectioning ?? null : null
    const next = typeof action === "function" ? action(before) : action
    sourceEdited.current = next !== null
    if (!sourceEdited.current && !renderingEdited.current) draft.setPending(null)
    else draft.setPending((pair) => ({ ...(pair ?? current), sectioning: next ?? current.sectioning }))
  }, [])
  const setRendering = useCallback((action: SetStateAction<Rendering | null>) => {
    const { current, draft } = state.current
    const before = renderingEdited.current ? draft.pending?.rendering ?? null : null
    const next = typeof action === "function" ? action(before) : action
    renderingEdited.current = next !== null
    if (!sourceEdited.current && !renderingEdited.current) draft.setPending(null)
    else draft.setPending((pair) => ({ ...(pair ?? current), rendering: next ?? current.rendering }))
  }, [])
  const markEditing = useCallback(() => {
    const { current, draft } = state.current
    draft.setPending((pair) => pair ?? current)
  }, [])
  const completeSave = useCallback((ticket: ReturnType<typeof draft.captureSave>, version: number, renderingVersion: number) => {
    const cleared = state.current.draft.completeSave(ticket, version, renderingVersion)
    if (cleared) { sourceEdited.current = false; renderingEdited.current = false }
    return cleared
  }, [])
  return { ...draft, completeSave, markEditing, setSectioning, setRendering,
    sectioning: sourceEdited.current ? draft.pending?.sectioning ?? null : null,
    rendering: renderingEdited.current ? draft.pending?.rendering ?? null : null }
}
