import { useSyncExternalStore } from "react"
import { NO_DRAFTS, hasDrafts, withDraft, type SectionDrafts } from "./renderingDraft"

interface DraftState {
  pageId: string | null
  drafts: SectionDrafts
}

let state: DraftState = { pageId: null, drafts: NO_DRAFTS }
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function draftsFor(pageId: string | null): SectionDrafts {
  return pageId !== null && state.pageId === pageId ? state.drafts : NO_DRAFTS
}

export function getDrafts(pageId: string | null): SectionDrafts {
  return draftsFor(pageId)
}

export function hasAnyDrafts(): boolean {
  return hasDrafts(state.drafts)
}

export function setDraft(
  pageId: string,
  sectionIndex: number,
  html: string,
  baseline: string,
): void {
  const current = draftsFor(pageId)
  const next = withDraft(current, sectionIndex, html, baseline)
  if (next === current && state.pageId === pageId) return
  state = { pageId, drafts: next }
  emit()
}

export function clearDrafts(pageId: string): void {
  if (state.pageId === pageId && !hasDrafts(state.drafts)) return
  state = { pageId, drafts: NO_DRAFTS }
  emit()
}

export function useDrafts(pageId: string | null): SectionDrafts {
  return useSyncExternalStore(
    subscribe,
    () => draftsFor(pageId),
    () => NO_DRAFTS,
  )
}

export function useIsDirty(pageId: string | null): boolean {
  return useSyncExternalStore(
    subscribe,
    () => hasDrafts(draftsFor(pageId)),
    () => false,
  )
}

export function useSectionHtml(
  pageId: string | null,
  sectionIndex: number | null,
  baseline: string,
): string {
  const drafts = useDrafts(pageId)
  if (sectionIndex === null) return ""
  return drafts[sectionIndex] ?? baseline
}
