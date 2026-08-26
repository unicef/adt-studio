import { useMemo } from "react"
import { ChevronLeft, ChevronRight, ImageOff, LayoutGrid, Loader2, TriangleAlert } from "lucide-react"
import { Trans, useLingui } from "@lingui/react/macro"
import type { PageDetail } from "@/api/client"
import { usePage, usePageImage } from "@/hooks/use-pages"
import { useActiveConfig } from "@/hooks/use-debug"
import { tint } from "@/components/app/screens/pipeline/shared/plugins"
import { CascadeResetDialog } from "@/components/pipeline/components/CascadeResetDialog"
import { DetailNavButton, SaveError, StepBody, StepEmptyHint } from "../shared/ui"
import { usePrefetchAdjacentPages } from "../shared/usePrefetchAdjacentPages"
import { SectioningSectionCard } from "./SectioningSectionCard"
import { useSectioningEdits } from "./useSectioningEdits"

export function SectioningPageDetail({
  label,
  pageId,
  accent,
  prevPageId,
  nextPageId,
  onStep,
  onClose,
}: {
  label: string
  pageId: string
  accent: string
  prevPageId: string | null
  nextPageId: string | null
  onStep: (pageId: string) => void
  onClose: () => void
}) {
  const { t } = useLingui()
  const { data: page, isLoading } = usePage(label, pageId)
  usePrefetchAdjacentPages(label, prevPageId, nextPageId)

  return (
    <StepBody
      title={page ? <Trans>Page {page.pageNumber}</Trans> : <Trans>Page</Trans>}
      meta={pageId}
      actions={
        <>
          <DetailNavButton
            icon={ChevronLeft}
            label={t`Previous page`}
            onClick={() => prevPageId && onStep(prevPageId)}
            disabled={!prevPageId}
          />
          <DetailNavButton
            icon={ChevronRight}
            label={t`Next page`}
            onClick={() => nextPageId && onStep(nextPageId)}
            disabled={!nextPageId}
          />
          <DetailNavButton icon={LayoutGrid} label={t`All pages`} onClick={onClose}>
            <Trans>All pages</Trans>
          </DetailNavButton>
        </>
      }
    >
      {isLoading || !page ? (
        <div className="flex items-center gap-2 rounded-lg border border-dashed p-3 text-[12px] text-muted-foreground">
          <Loader2 className="size-3.5 shrink-0 animate-spin motion-reduce:animate-none" />
          <Trans>Loading page…</Trans>
        </div>
      ) : !page.sectioningTree ? (
        <StepEmptyHint>
          <Trans>This page has no sectioning output yet.</Trans>
        </StepEmptyHint>
      ) : (
        <SectioningEditor
          label={label}
          pageId={pageId}
          page={page}
          accent={accent}
          hasPrevPage={!!prevPageId}
          hasNextPage={!!nextPageId}
        />
      )}
    </StepBody>
  )
}

function SectioningEditor({
  label,
  pageId,
  page,
  accent,
  hasPrevPage,
  hasNextPage,
}: {
  label: string
  pageId: string
  page: PageDetail
  accent: string
  hasPrevPage: boolean
  hasNextPage: boolean
}) {
  const { t } = useLingui()
  const { data: imageData } = usePageImage(label, pageId)
  const { data: configData } = useActiveConfig(label)

  const merged = configData?.merged
  const textRoles = merged?.role_types as Record<string, string> | undefined
  const containerStructures = merged?.structure_types as Record<string, string> | undefined
  const sectionTypes = useMemo(() => {
    const all = merged?.section_types as Record<string, string> | undefined
    if (!all) return undefined
    const disabled = new Set((merged?.disabled_section_types as string[]) ?? [])
    return Object.fromEntries(Object.entries(all).filter(([key]) => !disabled.has(key)))
  }, [merged])

  const edits = useSectioningEdits(label, pageId, page)
  const busy = edits.saving || edits.structuralBusy
  const reasoning = page.sectioningTree?.reasoning

  return (
    <>
      {page.extractionWarning && (
        <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-[12px] text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
          <p className="min-w-0 flex-1 leading-relaxed">
            <Trans>
              This page has no embedded text layer — the text below was recovered from the page
              image (vision). For better summaries, metadata, and translations, prefer a text-based
              version of this PDF.
            </Trans>
          </p>
        </div>
      )}

      <SaveError error={edits.saveError} />

      {reasoning && (
        <p
          className="rounded-lg px-3 py-2 text-[11.5px] leading-relaxed text-muted-foreground"
          style={{ background: tint(accent, 0.06) }}
        >
          {reasoning}
        </p>
      )}

      <div className="flex gap-6">
        <div className="w-[45%] shrink-0 self-start lg:sticky lg:top-0">
          {imageData ? (
            <img
              src={`data:image/png;base64,${imageData.imageBase64}`}
              alt={t`Page image`}
              className="block h-auto w-full rounded-lg border bg-white shadow-sm"
            />
          ) : (
            <div className="flex aspect-[3/4] w-full items-center justify-center rounded-lg border bg-muted/50 text-[12.5px] text-muted-foreground">
              <div className="flex flex-col items-center gap-2">
                <ImageOff className="size-6" />
                <Trans>Loading image…</Trans>
              </div>
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-4">
          {edits.mergedSections.length === 0 ? (
            <StepEmptyHint>
              <Trans>No sections on this page</Trans>
            </StepEmptyHint>
          ) : (
            edits.mergedSections.map((section, index) => (
              <SectioningSectionCard
                key={section.sectionId}
                label={label}
                section={section}
                index={index}
                count={edits.mergedSections.length}
                accent={accent}
                hasPrevPage={hasPrevPage}
                hasNextPage={hasNextPage}
                edited={!!edits.pendingBySectionId[section.sectionId]}
                busy={busy}
                structuralDisabled={edits.structuralDisabled}
                dirty={edits.dirty}
                sectionTypes={sectionTypes}
                textRoles={textRoles}
                containerStructures={containerStructures}
                onChange={edits.changeSection}
                onMerge={edits.mergeSection}
                onMergeCrossPage={edits.mergeSectionCrossPage}
                onRequestMerge={edits.requestSectionMerge}
                onRequestSplit={edits.requestSplitSection}
                onRequestClone={edits.requestCloneSection}
                onRequestDelete={edits.requestDeleteSection}
              />
            ))
          )}
        </div>
      </div>

      {edits.pendingOp && (
        <CascadeResetDialog
          open
          onOpenChange={(next) => {
            if (!next) edits.cancelPendingOp()
          }}
          affectedStages={edits.downstreamAffected}
          headerStageSlug="sectioning"
          title={edits.pendingOp.title}
          description={
            <>
              {edits.pendingOp.description}
              {edits.downstreamAffected.length > 0 && (
                <>
                  {edits.pendingOp.description ? " " : null}
                  <Trans>
                    The completed stages below will be reset and need to run again before final
                    outputs are available.
                  </Trans>
                </>
              )}
            </>
          }
          confirmLabel={edits.pendingOp.confirmLabel}
          confirmColorClass={edits.pendingOp.colorClass}
          confirmIcon={edits.pendingOp.icon}
          onConfirm={edits.confirmPendingOp}
        />
      )}
    </>
  )
}
