import { useCallback, useMemo, useRef, useState, type ComponentType } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useLingui } from "@lingui/react/macro"
import { Copy, Merge, Save, Scissors, Trash2 } from "lucide-react"
import type { PageSectioningOutput, PageSectioningSection, StageName } from "@adt/types"
import { api, type PageDetail } from "@/api/client"
import { invalidateStoryboardDependents } from "@/hooks/use-page-mutations"
import { useDownstreamWithOutput } from "@/hooks/use-downstream-with-output"
import { usePendingChanges } from "@/components/pipeline/components/change-summary"
import { useFloatingSave } from "@/components/pipeline/components/floating-save"

export interface SectioningPendingOp {
  title: string
  description?: string
  confirmLabel: string
  icon: ComponentType<{ className?: string }>
  colorClass: string
  run: () => void
}

export interface SectioningEdits {
  mergedSections: PageSectioningSection[]
  pendingBySectionId: Record<string, PageSectioningSection>
  dirty: boolean
  saving: boolean
  structuralBusy: boolean
  structuralDisabled: boolean
  saveError: string | null
  downstreamAffected: StageName[]
  pendingOp: SectioningPendingOp | null
  cancelPendingOp: () => void
  confirmPendingOp: () => void
  changeSection: (next: PageSectioningSection) => void
  mergeSection: (sectionIndex: number, direction: "prev" | "next") => void
  mergeSectionCrossPage: (sectionIndex: number, direction: "prev" | "next") => void
  requestSectionMerge: (label: string, action: () => void) => void
  requestSplitSection: (
    sectionIndex: number,
    at: { beforeNodeIndex: number } | { beforeNodeId: string },
  ) => void
  requestCloneSection: (sectionIndex: number) => void
  requestDeleteSection: (sectionIndex: number) => void
}

const NO_SECTIONS: PageSectioningSection[] = []

export function useSectioningEdits(label: string, pageId: string, page: PageDetail): SectioningEdits {
  const { t } = useLingui()
  const queryClient = useQueryClient()

  const [pendingBySectionId, setPendingBySectionId] = useState<Record<string, PageSectioningSection>>({})
  const [saving, setSaving] = useState(false)
  const savePromiseRef = useRef<Promise<void> | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [structuralBusy, setStructuralBusy] = useState(false)
  const [pendingOp, setPendingOp] = useState<SectioningPendingOp | null>(null)

  const downstreamAffected = useDownstreamWithOutput("sectioning")
  // Primitive derivation: the hook returns a fresh array every render, which
  // would otherwise defeat `requestSave`'s memoization.
  const hasDownstream = downstreamAffected.length > 0

  // Reset pending edits when navigating to a different page — during render so
  // `dirty` is already false on the very first render of the new page, keeping
  // the floating-save entry from re-registering the previous page's edits.
  const [pendingPageId, setPendingPageId] = useState(pageId)
  if (pendingPageId !== pageId) {
    setPendingPageId(pageId)
    setPendingBySectionId({})
    setSaveError(null)
    setPendingOp(null)
  }

  const sectionsFromServer = (page.sectioningTree?.sections ?? NO_SECTIONS) as PageSectioningSection[]
  const reasoning = page.sectioningTree?.reasoning ?? ""
  const mergedSections = useMemo(
    () => sectionsFromServer.map((s) => pendingBySectionId[s.sectionId] ?? s),
    [sectionsFromServer, pendingBySectionId],
  )
  const dirty = Object.keys(pendingBySectionId).length > 0

  const changeSection = useCallback((next: PageSectioningSection) => {
    setPendingBySectionId((prev) => ({ ...prev, [next.sectionId]: next }))
  }, [])

  const handleDiscard = useCallback(() => {
    setPendingBySectionId({})
    setSaveError(null)
  }, [])

  const performSave = useCallback((): Promise<void> => {
    if (!dirty) return Promise.resolve()
    if (savePromiseRef.current) return savePromiseRef.current

    const savePromise = (async () => {
      setSaving(true)
      setSaveError(null)
      try {
        const payload: PageSectioningOutput = { reasoning, sections: mergedSections }
        await api.updateSectioning(label, pageId, payload)
        setPendingBySectionId({})
        // Refresh in the background: the unsaved-changes guard awaits this
        // function, and `invalidateQueries` only settles once refetches finish.
        void queryClient.invalidateQueries({ queryKey: ["books", label, "pages", pageId] })
        void queryClient.invalidateQueries({ queryKey: ["books", label, "pages"] })
        invalidateStoryboardDependents(queryClient, label)
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : t`Save failed`)
        // Rethrow so "Save & leave" does not navigate away after a failed save.
        throw err
      } finally {
        setSaving(false)
      }
    })()

    savePromiseRef.current = savePromise
    void savePromise.then(
      () => {
        if (savePromiseRef.current === savePromise) savePromiseRef.current = null
      },
      () => {
        if (savePromiseRef.current === savePromise) savePromiseRef.current = null
      },
    )
    return savePromise
  }, [dirty, reasoning, mergedSections, label, pageId, queryClient, t])

  // Saving resets the storyboard chain, so confirm first when completed
  // downstream stages would be lost — cancelling leaves the edits pending.
  const requestSave = useCallback(() => {
    if (!dirty || saving) return
    if (hasDownstream) {
      setPendingOp({
        title: t`Save section changes?`,
        confirmLabel: t`Save changes`,
        icon: Save,
        colorClass: "bg-sky-600 hover:bg-sky-700",
        run: () => void performSave().catch(() => {}),
      })
      return
    }
    void performSave().catch(() => {})
  }, [dirty, saving, hasDownstream, performSave, t])

  // Server-side structural ops rewrite sectionIds, so they apply immediately
  // and are blocked while there are unsaved local edits.
  const requestStructuralOp = useCallback(
    (op: SectioningPendingOp) => {
      if (saving || structuralBusy) return
      if (dirty) {
        setSaveError(t`Save or discard your edits first`)
        return
      }
      setPendingOp(op)
    },
    [saving, structuralBusy, dirty, t],
  )

  const runStructural = useCallback(
    async (op: () => Promise<string | null>) => {
      if (saving || structuralBusy) return
      setStructuralBusy(true)
      setSaveError(null)
      try {
        const otherPageId = await op()
        setPendingBySectionId({})
        await queryClient.invalidateQueries({ queryKey: ["books", label, "pages", pageId] })
        // Section ops migrate the index-keyed editable-activities map too.
        await queryClient.invalidateQueries({ queryKey: ["editable-activities", label, pageId] })
        if (otherPageId) {
          await queryClient.invalidateQueries({ queryKey: ["books", label, "pages", otherPageId] })
          await queryClient.invalidateQueries({ queryKey: ["editable-activities", label, otherPageId] })
        }
        await queryClient.invalidateQueries({ queryKey: ["books", label, "pages"] })
        invalidateStoryboardDependents(queryClient, label)
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : t`Operation failed`)
      } finally {
        setStructuralBusy(false)
      }
    },
    [saving, structuralBusy, queryClient, label, pageId, t],
  )

  const mergeSection = useCallback(
    (sectionIndex: number, direction: "prev" | "next") =>
      void runStructural(async () => {
        await api.mergeSection(label, pageId, sectionIndex, direction)
        return null
      }),
    [runStructural, label, pageId],
  )

  const mergeSectionCrossPage = useCallback(
    (sectionIndex: number, direction: "prev" | "next") =>
      void runStructural(async () => {
        const result = await api.mergeSectionCrossPage(label, pageId, sectionIndex, direction)
        return result.targetPageId
      }),
    [runStructural, label, pageId],
  )

  const requestSectionMerge = useCallback(
    (opLabel: string, action: () => void) =>
      requestStructuralOp({
        title: t`Confirm merge`,
        description: t`Are you sure you want to ${{ label: opLabel }}? This action cannot be undone.`,
        confirmLabel: t`Continue`,
        icon: Merge,
        colorClass: "bg-sky-600 hover:bg-sky-700",
        run: action,
      }),
    [requestStructuralOp, t],
  )

  const requestSplitSection = useCallback(
    (sectionIndex: number, at: { beforeNodeIndex: number } | { beforeNodeId: string }) => {
      const opLabel = t`split this section`
      requestStructuralOp({
        title: t`Split section`,
        description: t`Are you sure you want to ${{ label: opLabel }}? This action cannot be undone.`,
        confirmLabel: t`Split`,
        icon: Scissors,
        colorClass: "bg-sky-600 hover:bg-sky-700",
        run: () =>
          void runStructural(async () => {
            await api.splitSection(label, pageId, sectionIndex, at)
            return null
          }),
      })
    },
    [requestStructuralOp, runStructural, label, pageId, t],
  )

  const requestCloneSection = useCallback(
    (sectionIndex: number) => {
      const opLabel = t`duplicate this section`
      requestStructuralOp({
        title: t`Duplicate section`,
        description: t`Are you sure you want to ${{ label: opLabel }}? This action cannot be undone.`,
        confirmLabel: t`Duplicate`,
        icon: Copy,
        colorClass: "bg-sky-600 hover:bg-sky-700",
        run: () =>
          void runStructural(async () => {
            await api.cloneSection(label, pageId, sectionIndex)
            return null
          }),
      })
    },
    [requestStructuralOp, runStructural, label, pageId, t],
  )

  const requestDeleteSection = useCallback(
    (sectionIndex: number) =>
      requestStructuralOp({
        title: t`Delete section`,
        description: t`Are you sure you want to delete this section? This action cannot be undone.`,
        confirmLabel: t`Delete`,
        icon: Trash2,
        colorClass: "bg-destructive hover:bg-destructive/90",
        run: () =>
          void runStructural(async () => {
            await api.deleteSection(label, pageId, sectionIndex)
            return null
          }),
      }),
    [requestStructuralOp, runStructural, label, pageId, t],
  )

  const cancelPendingOp = useCallback(() => setPendingOp(null), [])
  const confirmPendingOp = useCallback(() => {
    if (!pendingOp) return
    setPendingOp(null)
    pendingOp.run()
  }, [pendingOp])

  const { label: pendingLabel, labelKey: pendingLabelKey } = usePendingChanges({
    prev: sectionsFromServer,
    next: dirty ? mergedSections : undefined,
    keyOf: (s) => s.sectionId,
    isEqual: (a, b) => a === b || JSON.stringify(a) === JSON.stringify(b),
    classifyChanged: (before, after) =>
      !!before.isPruned !== !!after.isPruned ? (after.isPruned ? "pruned" : "restored") : "edited",
    // Local edits never add or remove sections — that only happens through the
    // server-side structural ops, which reset the pending map.
    includeAddRemove: false,
    noun: { one: t`section`, other: t`sections` },
  })

  useFloatingSave({
    id: `sectioning:${pageId}`,
    stage: "sectioning",
    resetStages: downstreamAffected,
    dirty,
    saving,
    label: pendingLabel,
    labelKey: pendingLabelKey,
    onSave: requestSave,
    // Awaited by the unsaved-changes guard's "Save & leave" — already a
    // deliberate confirmation, so it saves directly without a second dialog.
    onSaveStay: performSave,
    onDiscard: handleDiscard,
    saveDisabledReason: structuralBusy
      ? t`Please wait for the current operation to finish`
      : undefined,
  })

  return {
    mergedSections,
    pendingBySectionId,
    dirty,
    saving,
    structuralBusy,
    structuralDisabled: saving || structuralBusy || dirty,
    saveError,
    downstreamAffected,
    pendingOp,
    cancelPendingOp,
    confirmPendingOp,
    changeSection,
    mergeSection,
    mergeSectionCrossPage,
    requestSectionMerge,
    requestSplitSection,
    requestCloneSection,
    requestDeleteSection,
  }
}
