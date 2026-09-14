import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react"
import type { ReadingOrderEntry } from "@/api/client"
import { useFloatingSave } from "@/components/pipeline/components/floating-save"
import { useStepPendingLabel } from "@/components/pipeline/components/VersionPicker"
import { useReadingOrder, useSaveReadingOrder } from "./use-reading-order"

/**
 * The page order the user is arranging, before they commit it.
 *
 * Reordering used to write on every drop, which made each drag its own version:
 * rearranging ten pages left ten versions, and there was no Discard — putting
 * this one feature out of step with every other edit in the app, which holds a
 * pending change and offers Save / Discard in the shared floating bar.
 *
 * The draft lives here, above both surfaces that can change it, rather than in
 * either. The storyboard sidebar and the overview table are mounted at the same
 * time in the storyboard stage and edit the same entity, so a draft held inside
 * one of them would be invisible to — and silently overwritten by — the other.
 *
 * Registration lives here too. `useFloatingSave` removes the entry when its
 * caller unmounts, so if both surfaces registered under one id, closing the
 * overview would take the sidebar's pending change off the bar with it.
 */
interface ReadingOrderDraftValue {
  /** The uncommitted order, or null when there is nothing pending. */
  draft: ReadingOrderEntry[] | null
  /** Replace the pending order. */
  setDraft: (items: ReadingOrderEntry[]) => void
  /** Throw the pending order away and fall back to what the server holds. */
  discard: () => void
  /** A save is in flight. */
  saving: boolean
}

const ReadingOrderDraftContext = createContext<ReadingOrderDraftValue | null>(null)

export function ReadingOrderDraftProvider({
  bookLabel,
  children,
}: {
  bookLabel: string
  children: ReactNode
}) {
  const pendingLabel = useStepPendingLabel("reading-order")
  const [draft, setDraftState] = useState<ReadingOrderEntry[] | null>(null)
  const { data: readingOrder } = useReadingOrder(bookLabel)
  const saveOrder = useSaveReadingOrder(bookLabel)

  const discard = useCallback(() => {
    setDraftState(null)
  }, [])

  const setDraft = useCallback((items: ReadingOrderEntry[]) => {
    setDraftState(items)
  }, [])

  const save = useCallback(() => {
    if (!draft) return Promise.resolve()
    return new Promise<void>((resolve, reject) => {
      saveOrder.mutate(
        { items: draft, expectedVersion: readingOrder?.version ?? null },
        {
          // Only drop the draft once it is actually stored. Clearing on settle
          // would throw the user's arrangement away on a refused save, which is
          // exactly when they most need it kept.
          onSuccess: () => {
            setDraftState(null)
            resolve()
          },
          // `onSaveStay` is awaited by the navigation guard and must reject on
          // failure, or the guard lets the user leave and lose the draft.
          onError: (error) => {
            reject(error instanceof Error ? error : new Error(String(error)))
          },
        },
      )
    })
  }, [draft, readingOrder, saveOrder])

  useFloatingSave({
    id: `reading-order:${bookLabel}`,
    dirty: draft != null,
    saving: saveOrder.isPending,
    // The same icon-and-label pill every other pending change shows, rather
    // than a bare string, which rendered as oversized body text beside them.
    label: pendingLabel,
    stage: "storyboard",
    // A reorder re-sequences the bundle and the assessment that walks it, and
    // nothing else — the same two things the server clears.
    resetStages: ["package"],
    onSave: () => {
      void save().catch(() => {
        // Surfaced as a toast by the mutation; swallowed so the bar's click
        // handler does not reject into an unhandled rejection.
      })
    },
    onSaveStay: save,
    onDiscard: discard,
  })

  const value = useMemo<ReadingOrderDraftValue>(
    () => ({ draft, setDraft, discard, saving: saveOrder.isPending }),
    [draft, setDraft, discard, saveOrder.isPending],
  )

  return (
    <ReadingOrderDraftContext.Provider value={value}>{children}</ReadingOrderDraftContext.Provider>
  )
}

/**
 * The pending page order.
 *
 * Returns an inert draft outside the provider so a surface can be rendered on
 * its own (in a test, say) without needing the whole book route around it.
 */
export function useReadingOrderDraft(): ReadingOrderDraftValue {
  return (
    useContext(ReadingOrderDraftContext) ?? {
      draft: null,
      setDraft: () => {},
      discard: () => {},
      saving: false,
    }
  )
}
