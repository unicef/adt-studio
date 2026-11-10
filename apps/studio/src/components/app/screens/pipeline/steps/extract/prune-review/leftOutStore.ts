import { useCallback } from "react"
import { createPersistentStore } from "@/hooks/create-persistent-store"

function isRecord<T>(value: unknown): value is Record<string, T> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

const showAllStore = createPersistentStore<Record<string, boolean>>("adt.extract.left-out.show-all", {}, isRecord)
const marksStore = createPersistentStore<Record<string, boolean>>("adt.extract.left-out.marks", {}, isRecord)
const dismissStore = createPersistentStore<Record<string, string>>("adt.extract.left-out.dismissed", {}, isRecord)

export type ReviewDecision = "kept" | "back"

export interface ReviewProgress {
  active: boolean
  finished: boolean
  cursor: string | null
  decisions: Record<string, ReviewDecision>
}

export const EMPTY_PROGRESS: ReviewProgress = { active: false, finished: false, cursor: null, decisions: {} }

const progressStore = createPersistentStore<Record<string, ReviewProgress>>("adt.extract.left-out.review", {}, isRecord)

export function useShowAll(label: string): [boolean, (value: boolean) => void] {
  const [all, setAll] = showAllStore.use()
  const set = useCallback((value: boolean) => setAll((previous) => ({ ...previous, [label]: value })), [label, setAll])
  return [all[label] ?? false, set]
}

export function useMarksShown(label: string): [boolean, (value: boolean) => void] {
  const [all, setAll] = marksStore.use()
  const set = useCallback((value: boolean) => setAll((previous) => ({ ...previous, [label]: value })), [label, setAll])
  return [all[label] ?? true, set]
}

export function extractSignature(pages: ReadonlyArray<{ pageId: string; imageCount: number }>): string {
  let hash = 0
  for (const page of pages) {
    const text = `${page.pageId}:${page.imageCount};`
    for (let index = 0; index < text.length; index++) hash = (Math.imul(hash, 31) + text.charCodeAt(index)) | 0
  }
  return `${pages.length}-${(hash >>> 0).toString(36)}`
}

export function useAlertDismissed(label: string, signature: string): [boolean, () => void] {
  const [all, setAll] = dismissStore.use()
  const dismiss = useCallback(() => setAll((previous) => ({ ...previous, [label]: signature })), [label, signature, setAll])
  return [all[label] === signature, dismiss]
}

export function useReviewProgress(label: string): [ReviewProgress, (update: (previous: ReviewProgress) => ReviewProgress) => void] {
  const [all, setAll] = progressStore.use()
  const update = useCallback(
    (change: (previous: ReviewProgress) => ReviewProgress) => setAll((previous) => ({ ...previous, [label]: change(previous[label] ?? EMPTY_PROGRESS) })),
    [label, setAll],
  )
  return [all[label] ?? EMPTY_PROGRESS, update]
}
