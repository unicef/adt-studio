import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from "react"
import { createPortal } from "react-dom"
import { Copy, Eye, Merge, Save, Scissors, Trash2 } from "lucide-react"
import { Trans, useLingui } from "@lingui/react/macro"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import type { PageSectioningOutput, PageSectioningSection } from "@adt/types"
import { api, type PageDetail } from "@/api/client"
import { usePageImage } from "@/hooks/use-pages"
import { invalidateStoryboardDependents } from "@/hooks/use-page-mutations"
import { SectionTreeEditor } from "@/components/section-tree-editor/SectionTreeEditor"
import { SectionActionsDropdown } from "@/components/pipeline/stages/storyboard/components/SectionActionsDropdown"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  getSectionTypeLabel,
  getSectionTypeDescription,
} from "@/lib/section-constants"
import { useStepHeader } from "../../components/StepViewRouter"
import { usePendingChanges } from "../../components/change-summary"
import { useFloatingSave } from "../../components/floating-save"
import { CascadeResetDialog } from "../../components/CascadeResetDialog"
import { useDownstreamWithOutput } from "@/hooks/use-downstream-with-output"

export function SectioningPageDetail({
  bookLabel,
  pageId,
  page,
  navigationExtra,
  navigationArrows,
  hasPrevPage,
  hasNextPage,
}: {
  bookLabel: string
  pageId: string
  page: PageDetail
  navigationExtra: ReactNode
  navigationArrows: ReactNode
  hasPrevPage?: boolean
  hasNextPage?: boolean
}) {
  const { t } = useLingui()
  const queryClient = useQueryClient()
  const { headerSlotEl } = useStepHeader()
  const { data: imageData } = usePageImage(bookLabel, pageId)

  const configQuery = useQuery({
    queryKey: ["books", bookLabel, "config", "active"],
    queryFn: () => api.getActiveConfig(bookLabel),
    staleTime: 5 * 60 * 1000,
  })

  const textTypes = configQuery.data?.merged?.role_types as
    | Record<string, string>
    | undefined
  const groupTypes = configQuery.data?.merged?.structure_types as
    | Record<string, string>
    | undefined
  const allSectionTypes = configQuery.data?.merged?.section_types as
    | Record<string, string>
    | undefined
  const disabledSectionTypes = new Set(
    (configQuery.data?.merged?.disabled_section_types as string[]) ?? []
  )
  const sectionTypes = allSectionTypes
    ? Object.fromEntries(
        Object.entries(allSectionTypes).filter(
          ([key]) => !disabledSectionTypes.has(key)
        )
      )
    : undefined

  // Keyed by sectionId — a section only appears here once the user has edited
  // it, and the saved version replaces the original on `onChange`.
  const [pendingBySectionId, setPendingBySectionId] = useState<
    Record<string, PageSectioningSection>
  >({})
  const [saving, setSaving] = useState(false)
  const savePromiseRef = useRef<Promise<void> | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [structuralBusy, setStructuralBusy] = useState(false)

  /**
   * A pending action awaiting confirmation. Every mutation that resets the
   * storyboard chain — the save and all five structural ops — goes through one
   * dialog so they all warn the same way about the stages they invalidate.
   */
  type PendingOp = {
    title: string
    /** Op-specific sentence; the cascade notice is appended when relevant. */
    description?: string
    confirmLabel: string
    icon: ComponentType<{ className?: string }>
    colorClass: string
    run: () => void
  }
  const [pendingOp, setPendingOp] = useState<PendingOp | null>(null)

  // A sectioning edit invalidates the storyboard's rendered HTML, and every
  // later output (text catalog, translations, audio, the packaged book) is
  // re-derived from that HTML. Saving therefore resets those stages, so warn
  // first and let the user decide — nothing is re-run automatically.
  // Held in a ref because the hook returns a fresh array every render, which
  // would otherwise defeat `performSave`'s memoization.
  const downstreamAffected = useDownstreamWithOutput("sectioning")
  const downstreamRef = useRef(downstreamAffected)
  downstreamRef.current = downstreamAffected

  // Reset pending edits when navigating to a different page. Done during render
  // (React's "adjust state when a prop changes" pattern) rather than in an
  // effect so `dirty` is already false on the very first render of the new page
  // — otherwise the floating-save entry re-registers the previous page's edits
  // under the new pageId for one commit after "Discard & leave".
  const [pendingPageId, setPendingPageId] = useState(pageId)
  if (pendingPageId !== pageId) {
    setPendingPageId(pageId)
    setPendingBySectionId({})
    setSaveError(null)
    setPendingOp(null)
  }

  const sectionsFromServer = (page.sectioningTree?.sections ??
    []) as PageSectioningSection[]
  const mergedSections: PageSectioningSection[] = useMemo(
    () => sectionsFromServer.map((s) => pendingBySectionId[s.sectionId] ?? s),
    [sectionsFromServer, pendingBySectionId]
  )
  const dirty = Object.keys(pendingBySectionId).length > 0

  const handleSectionChange = useCallback((next: PageSectioningSection) => {
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
        const payload: PageSectioningOutput = {
          reasoning: page.sectioningTree?.reasoning ?? "",
          sections: mergedSections,
        }
        await api.updateSectioning(bookLabel, pageId, payload)
        setPendingBySectionId({})
        // Refresh in the background. The unsaved-changes guard awaits this
        // function before resuming a blocked navigation, and `invalidateQueries`
        // only settles once the refetches finish — awaiting it would hold the
        // guard's dialog open for seconds after the edits are already safe.
        void queryClient.invalidateQueries({
          queryKey: ["books", bookLabel, "pages", pageId],
        })
        void queryClient.invalidateQueries({
          queryKey: ["books", bookLabel, "pages"],
        })
        invalidateStoryboardDependents(queryClient, bookLabel)
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : t`Save failed`)
        // Rethrow so UnsavedChangesGuard's "Save & leave" does NOT navigate away
        // (dropping the edits) when the save failed.
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
  }, [
    dirty,
    page.sectioningTree?.reasoning,
    mergedSections,
    bookLabel,
    pageId,
    queryClient,
    t,
  ])

  /**
   * Explicit Save from the floating bar. Saving resets the storyboard chain, so
   * when there are completed downstream stages to lose we confirm first —
   * cancelling leaves the edits pending rather than saving them into an
   * inconsistent state. This applies to fixed-layout books too: the API clears
   * the chain for every `page-sectioning` save regardless of render mode, and
   * quiz generation reads the semantic sectioning even in fixed-layout, so
   * exempting them would silently discard completed audio and packaged output.
   */
  const requestSave = useCallback(() => {
    if (!dirty || saving) return
    if (downstreamRef.current.length > 0) {
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
  }, [dirty, saving, performSave, t])

  /**
   * Gate for the server-side structural ops (split / duplicate / merge /
   * cross-page merge / delete). They apply immediately and rewrite sectionIds,
   * so they are confirmed first — and, like the save, they invalidate the
   * storyboard chain, which the dialog spells out.
   */
  const requestStructuralOp = useCallback(
    (op: PendingOp) => {
      if (saving || structuralBusy) return
      if (dirty) {
        setSaveError(t`Save or discard your edits first`)
        return
      }
      setPendingOp(op)
    },
    [saving, structuralBusy, dirty, t]
  )

  // Feed the shared floating save bar and the app-wide unsaved-changes guard
  // (route blocker + beforeunload + desktop quit dialog), same as the storyboard
  // section editor.
  const { label: pendingLabel, labelKey: pendingLabelKey } = usePendingChanges({
    prev: sectionsFromServer,
    next: dirty ? mergedSections : undefined,
    keyOf: (s) => s.sectionId,
    isEqual: (a, b) => a === b || JSON.stringify(a) === JSON.stringify(b),
    classifyChanged: (before, after) =>
      !!before.isPruned !== !!after.isPruned
        ? after.isPruned
          ? "pruned"
          : "restored"
        : "edited",
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
    // The bar's own Save button routes through the cascade confirmation.
    onSave: requestSave,
    // Awaited by the unsaved-changes guard's "Save & leave", which is already a
    // deliberate confirmation — so it saves directly rather than stacking a
    // second dialog on top (and a dialog in here would hang its spinner).
    // Rejects on failure so a failed save keeps the user on the page.
    onSaveStay: performSave,
    onDiscard: handleDiscard,
    saveDisabledReason: structuralBusy
      ? t`Please wait for the current operation to finish`
      : undefined,
  })

  // Server-side structural ops (merge/split/clone/delete) rewrite sectionIds,
  // so they are blocked while there are unsaved local edits.
  const structuralDisabled = saving || structuralBusy || dirty

  const runStructural = useCallback(
    async (op: () => Promise<string | null>) => {
      if (saving || structuralBusy) return
      setStructuralBusy(true)
      setSaveError(null)
      try {
        const otherPageId = await op()
        setPendingBySectionId({})
        await queryClient.invalidateQueries({
          queryKey: ["books", bookLabel, "pages", pageId],
        })
        // Section ops migrate the index-keyed editable-activities map too.
        await queryClient.invalidateQueries({
          queryKey: ["editable-activities", bookLabel, pageId],
        })
        if (otherPageId) {
          await queryClient.invalidateQueries({
            queryKey: ["books", bookLabel, "pages", otherPageId],
          })
          await queryClient.invalidateQueries({
            queryKey: ["editable-activities", bookLabel, otherPageId],
          })
        }
        await queryClient.invalidateQueries({
          queryKey: ["books", bookLabel, "pages"],
        })
        invalidateStoryboardDependents(queryClient, bookLabel)
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : t`Operation failed`)
      } finally {
        setStructuralBusy(false)
      }
    },
    [saving, structuralBusy, queryClient, bookLabel, pageId, t]
  )

  const handleMergeSection = (sectionIndex: number, direction: "next" | "prev") =>
    runStructural(async () => {
      await api.mergeSection(bookLabel, pageId, sectionIndex, direction)
      return null
    })

  const handleMergeCrossPage = (sectionIndex: number, direction: "next" | "prev") =>
    runStructural(async () => {
      const result = await api.mergeSectionCrossPage(
        bookLabel,
        pageId,
        sectionIndex,
        direction
      )
      return result.targetPageId
    })

  const handleCloneSection = (sectionIndex: number) =>
    runStructural(async () => {
      await api.cloneSection(bookLabel, pageId, sectionIndex)
      return null
    })

  const handleDeleteSection = (sectionIndex: number) =>
    runStructural(async () => {
      await api.deleteSection(bookLabel, pageId, sectionIndex)
      return null
    })

  // Entry point for the footer "Merge" menu — the dropdown supplies the action
  // phrase ("merge with next section") used in the confirmation sentence.
  const requestSectionMerge = (label: string, action: () => void) =>
    requestStructuralOp({
      title: t`Confirm merge`,
      description: t`Are you sure you want to ${label}? This action cannot be undone.`,
      confirmLabel: t`Continue`,
      icon: Merge,
      colorClass: "bg-sky-600 hover:bg-sky-700",
      run: action,
    })

  const requestSplitSection = (
    sectionIndex: number,
    at: { beforeNodeIndex: number } | { beforeNodeId: string }
  ) => {
    const label = t`split this section`
    requestStructuralOp({
      title: t`Split section`,
      description: t`Are you sure you want to ${label}? This action cannot be undone.`,
      confirmLabel: t`Split`,
      icon: Scissors,
      colorClass: "bg-sky-600 hover:bg-sky-700",
      run: () =>
        void runStructural(async () => {
          await api.splitSection(bookLabel, pageId, sectionIndex, at)
          return null
        }),
    })
  }

  const requestCloneSection = (sectionIndex: number) => {
    const label = t`duplicate this section`
    requestStructuralOp({
      title: t`Duplicate section`,
      description: t`Are you sure you want to ${label}? This action cannot be undone.`,
      confirmLabel: t`Duplicate`,
      icon: Copy,
      colorClass: "bg-sky-600 hover:bg-sky-700",
      run: () => void handleCloneSection(sectionIndex),
    })
  }

  const requestDeleteSection = (sectionIndex: number) =>
    requestStructuralOp({
      title: t`Delete section`,
      description: t`Are you sure you want to delete this section? This action cannot be undone.`,
      confirmLabel: t`Delete`,
      icon: Trash2,
      colorClass: "bg-destructive hover:bg-destructive/90",
      run: () => void handleDeleteSection(sectionIndex),
    })

  // Save/Discard live in the shared FloatingSaveBar (the codebase convention —
  // see VersionPicker), so the header only flags that edits are pending.
  const headerControls = (
    <div className="flex-1 flex items-center gap-3 drag-region">
      {navigationExtra}
      {dirty ? (
        <span
          className="w-1.5 h-1.5 rounded-full bg-amber-400"
          title={t`Unsaved changes`}
        />
      ) : null}
      {saveError ? (
        <span className="text-xs text-destructive">{saveError}</span>
      ) : null}
      <div className="flex gap-1 ml-auto">{navigationArrows}</div>
    </div>
  )

  return (
    <>
    {headerSlotEl && createPortal(headerControls, headerSlotEl)}
    <div className="flex h-full min-h-0">
      <div className="w-1/2 min-w-0 border-r overflow-auto bg-muted/10 p-4">
        {imageData ? (
          <img
            src={`data:image/png;base64,${imageData.imageBase64}`}
            alt={t`Page image`}
            className="w-full h-auto rounded border bg-white shadow-sm"
          />
        ) : (
          <div className="text-sm text-muted-foreground">
            <Trans>Loading image...</Trans>
          </div>
        )}
      </div>
      <div className="w-1/2 min-w-0 overflow-auto p-4 space-y-4">
        {page.extractionWarning && (
          <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
            <Eye className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
            <span className="text-[12px] text-amber-700 leading-relaxed">
              <Trans>
                This page has no embedded text layer — the text below was
                recovered from the page image (vision). For better summaries,
                metadata, and translations, prefer a text-based version of this
                PDF.
              </Trans>
            </span>
          </div>
        )}
        {mergedSections.length === 0 ? (
          <div className="text-sm text-muted-foreground italic">
            <Trans>No sections on this page</Trans>
          </div>
        ) : (
          mergedSections.map((section, idx) => (
            <div key={section.sectionId}>
              <div className="flex items-center gap-3 mb-2">
                <div className="text-xs font-medium text-muted-foreground">
                  {`#${idx + 1}`}
                </div>
                <div className="text-sm font-semibold">{section.sectionId}</div>
                {sectionTypes ? (
                  <Select
                    value={section.sectionType}
                    onValueChange={(value) =>
                      handleSectionChange({ ...section, sectionType: value })
                    }
                    disabled={saving || structuralBusy}
                  >
                    <SelectTrigger className="h-6 text-[10px] font-medium px-1.5 py-0 w-auto min-w-[80px] border-0 bg-muted/50">
                      <SelectValue>
                        {getSectionTypeLabel(section.sectionType) ||
                          section.sectionType.replace(/_/g, " ")}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(sectionTypes).map(([key, desc]) => (
                        <SelectItem key={key} value={key} className="text-xs">
                          {getSectionTypeLabel(key) || key.replace(/_/g, " ")}
                          <span className="ml-1 text-muted-foreground text-[10px]">
                            {getSectionTypeDescription(key) ?? desc}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <span className="text-xs uppercase tracking-wide text-muted-foreground">
                    {section.sectionType}
                  </span>
                )}
                {section.isPruned ? (
                  <span className="text-xs text-amber-600">
                    <Trans>pruned</Trans>
                  </span>
                ) : null}
                {pendingBySectionId[section.sectionId] ? (
                  <span className="text-xs text-amber-600">
                    <Trans>edited</Trans>
                  </span>
                ) : null}
                <div className="ml-auto">
                  <SectionActionsDropdown
                    sectionIndex={idx}
                    sectionCount={mergedSections.length}
                    isPruned={section.isPruned}
                    hasPrevPage={hasPrevPage}
                    hasNextPage={hasNextPage}
                    onTogglePrune={() =>
                      handleSectionChange({
                        ...section,
                        isPruned: !section.isPruned,
                      })
                    }
                    onMerge={(direction) => handleMergeSection(idx, direction)}
                    onMergeCrossPage={(direction) =>
                      handleMergeCrossPage(idx, direction)
                    }
                    onClone={() => requestCloneSection(idx)}
                    onDelete={() => requestDeleteSection(idx)}
                    onConfirmMerge={requestSectionMerge}
                    disabled={structuralDisabled}
                    disabledReason={
                      dirty
                        ? t`Save or discard your edits first`
                        : t`Please wait for the current operation to finish`
                    }
                    pruneDisabled={saving || structuralBusy}
                  />
                </div>
              </div>
              <div className="border rounded bg-muted/20 p-3">
                <SectionTreeEditor
                  section={section}
                  onChange={handleSectionChange}
                  bookLabel={bookLabel}
                  textRoles={textTypes}
                  containerStructures={groupTypes}
                  disabled={saving || structuralBusy}
                  // A split is a server-side op that rewrites sectionIds, so it
                  // can't run over unsaved local edits. Disable it visibly
                  // rather than failing with an easily-missed inline error.
                  splitDisabledReason={
                    dirty
                      ? t`Save or discard your edits first`
                      : structuralBusy
                        ? t`Please wait for the current operation to finish`
                        : undefined
                  }
                  onSplitBefore={(beforeNodeIndex) =>
                    requestSplitSection(idx, { beforeNodeIndex })
                  }
                  onSplitSection={(beforeNodeId) =>
                    requestSplitSection(idx, { beforeNodeId })
                  }
                  sectionMergeItems={[
                    ...(idx > 0
                      ? [
                          {
                            label: t`Merge with previous`,
                            onClick: () =>
                              requestSectionMerge(
                                t`merge with previous section`,
                                () => void handleMergeSection(idx, "prev")
                              ),
                          },
                        ]
                      : hasPrevPage
                        ? [
                            {
                              label: t`Merge with last section of previous page`,
                              onClick: () =>
                                requestSectionMerge(
                                  t`merge this section into the last section of the previous page`,
                                  () => void handleMergeCrossPage(idx, "prev")
                                ),
                            },
                          ]
                        : []),
                    ...(idx < mergedSections.length - 1
                      ? [
                          {
                            label: t`Merge with next`,
                            onClick: () =>
                              requestSectionMerge(
                                t`merge with next section`,
                                () => void handleMergeSection(idx, "next")
                              ),
                          },
                        ]
                      : hasNextPage
                        ? [
                            {
                              label: t`Merge with first section of next page`,
                              onClick: () =>
                                requestSectionMerge(
                                  t`merge this section into the first section of the next page`,
                                  () => void handleMergeCrossPage(idx, "next")
                                ),
                            },
                          ]
                        : []),
                  ]}
                />
              </div>
            </div>
          ))
        )}
      </div>
    </div>

    {pendingOp && (
      <CascadeResetDialog
        open
        onOpenChange={(next) => {
          // Cancelling applies nothing: pending edits stay pending and no
          // structural op runs, so the book is never left half-changed.
          if (!next) setPendingOp(null)
        }}
        affectedStages={downstreamAffected}
        headerStageSlug="sectioning"
        title={pendingOp.title}
        description={
          <>
            {pendingOp.description}
            {downstreamAffected.length > 0 && (
              <>
                {pendingOp.description ? " " : null}
                <Trans>
                  The completed stages below will be reset and need to run again
                  before final outputs are available.
                </Trans>
              </>
            )}
          </>
        }
        confirmLabel={pendingOp.confirmLabel}
        confirmColorClass={pendingOp.colorClass}
        confirmIcon={pendingOp.icon}
        onConfirm={() => {
          const run = pendingOp.run
          setPendingOp(null)
          run()
        }}
      />
    )}
    </>
  )
}
