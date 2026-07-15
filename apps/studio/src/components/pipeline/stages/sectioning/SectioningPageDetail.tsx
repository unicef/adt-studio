import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { Eye } from "lucide-react"
import { Trans, useLingui } from "@lingui/react/macro"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import type { PageSectioningOutput, PageSectioningSection } from "@adt/types"
import { api, type PageDetail } from "@/api/client"
import { usePageImage } from "@/hooks/use-pages"
import { invalidateStoryboardDependents } from "@/hooks/use-page-mutations"
import { cn } from "@/lib/utils"
import { SectionTreeEditor } from "@/components/section-tree-editor/SectionTreeEditor"
import { SectionActionsDropdown } from "@/components/pipeline/stages/storyboard/components/SectionActionsDropdown"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
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
  const [saveError, setSaveError] = useState<string | null>(null)
  const [structuralBusy, setStructuralBusy] = useState(false)
  const [confirmMerge, setConfirmMerge] = useState<{
    action: () => void
    label: string
  } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null)

  // Reset pending edits when navigating to a different page.
  useEffect(() => {
    setPendingBySectionId({})
    setSaveError(null)
    setConfirmMerge(null)
    setConfirmDelete(null)
  }, [pageId])

  const sectionsFromServer = page.sectioningTree?.sections ?? []
  const mergedSections: PageSectioningSection[] = useMemo(
    () =>
      sectionsFromServer.map(
        (s) => pendingBySectionId[s.sectionId] ?? (s as PageSectioningSection)
      ),
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

  const handleSave = useCallback(async () => {
    if (!dirty || saving) return
    setSaving(true)
    setSaveError(null)
    try {
      const payload: PageSectioningOutput = {
        reasoning: page.sectioningTree?.reasoning ?? "",
        sections: mergedSections,
      }
      await api.updateSectioning(bookLabel, pageId, payload)
      setPendingBySectionId({})
      await queryClient.invalidateQueries({
        queryKey: ["books", bookLabel, "pages", pageId],
      })
      await queryClient.invalidateQueries({
        queryKey: ["books", bookLabel, "pages"],
      })
      invalidateStoryboardDependents(queryClient, bookLabel)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : t`Save failed`)
    } finally {
      setSaving(false)
    }
  }, [
    dirty,
    saving,
    page.sectioningTree?.reasoning,
    mergedSections,
    bookLabel,
    pageId,
    queryClient,
    t,
  ])

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
        if (otherPageId) {
          await queryClient.invalidateQueries({
            queryKey: ["books", bookLabel, "pages", otherPageId],
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

  // Entry point for the footer "Merge" menu: guard against unsaved edits,
  // then route through the shared confirmation dialog.
  const requestSectionMerge = (label: string, action: () => void) => {
    if (saving || structuralBusy) return
    if (dirty) {
      setSaveError(t`Save or discard your edits first`)
      return
    }
    setConfirmMerge({ label, action })
  }

  const handleSplitSection = (
    sectionIndex: number,
    at: { beforeNodeIndex: number } | { beforeNodeId: string }
  ) => {
    if (dirty) {
      setSaveError(t`Save or discard your edits before splitting`)
      return
    }
    void runStructural(async () => {
      await api.splitSection(bookLabel, pageId, sectionIndex, at)
      return null
    })
  }

  const headerControls = (
    <div className="flex-1 flex items-center gap-3 drag-region">
      {navigationExtra}
      {saveError ? (
        <span className="text-xs text-destructive">{saveError}</span>
      ) : null}
      {dirty ? (
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={handleDiscard}
            disabled={saving}
            className={cn(
              "text-xs px-2.5 py-1 rounded transition-colors",
              saving
                ? "text-white/40 cursor-default"
                : "text-white/70 hover:text-white hover:bg-white/10 cursor-pointer"
            )}
          >
            <Trans>Discard</Trans>
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className={cn(
              "text-xs px-2.5 py-1 rounded transition-colors",
              saving
                ? "bg-secondary/60 text-secondary-foreground/70 cursor-default"
                : "bg-secondary text-secondary-foreground hover:bg-secondary/80 cursor-pointer"
            )}
          >
            {saving ? <Trans>Saving…</Trans> : <Trans>Save</Trans>}
          </button>
        </div>
      ) : null}
      <div className={cn("flex gap-1", dirty ? "" : "ml-auto")}>{navigationArrows}</div>
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
                    disabled={saving}
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
                    onClone={() => handleCloneSection(idx)}
                    onDelete={() => setConfirmDelete(idx)}
                    onConfirmMerge={(label, action) =>
                      setConfirmMerge({ label, action })
                    }
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
                  disabled={saving}
                  onSplitBefore={(beforeNodeIndex) =>
                    handleSplitSection(idx, { beforeNodeIndex })
                  }
                  onSplitSection={(beforeNodeId) =>
                    handleSplitSection(idx, { beforeNodeId })
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

    {/* Merge confirmation dialog */}
    <Dialog
      open={!!confirmMerge}
      onOpenChange={(open) => {
        if (!open) setConfirmMerge(null)
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t`Confirm merge`}</DialogTitle>
          <DialogDescription>
            {t`Are you sure you want to ${confirmMerge?.label ?? ""}? This action cannot be undone.`}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <button
            type="button"
            onClick={() => setConfirmMerge(null)}
            className="px-3 py-1.5 text-sm rounded border hover:bg-accent transition-colors cursor-pointer"
          >
            {t`Cancel`}
          </button>
          <button
            type="button"
            onClick={() => {
              const action = confirmMerge?.action
              setConfirmMerge(null)
              action?.()
            }}
            className="px-3 py-1.5 text-sm rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer"
          >
            {t`Continue`}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Delete section confirmation dialog */}
    <Dialog
      open={confirmDelete !== null}
      onOpenChange={(open) => {
        if (!open) setConfirmDelete(null)
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t`Delete section`}</DialogTitle>
          <DialogDescription>
            {t`Are you sure you want to delete this section? This action cannot be undone.`}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <button
            type="button"
            onClick={() => setConfirmDelete(null)}
            className="px-3 py-1.5 text-sm rounded border hover:bg-accent transition-colors cursor-pointer"
          >
            {t`Cancel`}
          </button>
          <button
            type="button"
            onClick={() => {
              const idx = confirmDelete
              setConfirmDelete(null)
              if (idx !== null) void handleDeleteSection(idx)
            }}
            className="px-3 py-1.5 text-sm rounded bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors cursor-pointer"
          >
            {t`Delete`}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  )
}
