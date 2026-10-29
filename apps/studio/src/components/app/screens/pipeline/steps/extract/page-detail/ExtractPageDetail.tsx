import { ChevronLeft, ChevronRight, LayoutGrid } from "lucide-react"
import { Trans, useLingui } from "@lingui/react/macro"
import { ImageCropDialog, pageBoundsToCropRect } from "@/components/pipeline/stages/storyboard/components/ImageCropDialog"
import { SegmentPreviewDialog } from "@/components/pipeline/stages/storyboard/components/SegmentPreviewDialog"
import { DetailNavButton, SaveError, StepBody } from "../../shared/ui"
import { PageLoadError, PageNoticeGroup } from "../../shared/page-detail/PageNotices"
import { PageDetailLayout } from "./PageDetailLayout"
import { usePageDetailData } from "./usePageDetailData"
import { PageDetailLoading } from "./loading/PageDetailLoading"
import type { DescribedProblem } from "@/components/app/screens/pipeline/steps/shared/problems/useDescribeProblem"
import type { ProblemRetry } from "@/components/app/screens/pipeline/steps/shared/problems/FoldedProblem"
import { usePageProblem } from "./problem/usePageProblem"
import { PageProblemChip } from "./problem/PageProblemChip"

export function ExtractPageDetail({
  label,
  pageId,
  pageNumber,
  hex,
  prevPageId,
  nextPageId,
  onStep,
  onClose,
  problem = null,
  retry,
}: {
  label: string
  pageId: string
  pageNumber: number
  hex: string
  prevPageId: string | null
  nextPageId: string | null
  onStep: (pageId: string) => void
  onClose: () => void
  problem?: DescribedProblem | null
  retry?: ProblemRetry
}) {
  const { t } = useLingui()
  const data = usePageDetailData(label, pageId, prevPageId, nextPageId)
  const pageProblem = usePageProblem({ label, problem, pageId, pageNumber, retry })
  const { page, images, pageSrc, query } = data
  const cropBounds = images.cropTargetId ? page?.imagesMeta.find((meta) => meta.imageId === images.cropTargetId)?.bounds : undefined

  const content = page ? (
    <>
      <p className="-mt-2 shrink-0 font-mono text-[11px] text-muted-foreground/80">
        {data.pageSize ? t`${pageId} · page image ${data.pageSize.w} × ${data.pageSize.h}` : pageId}
      </p>

      <div className="flex shrink-0 flex-col gap-4 empty:hidden">
        <PageNoticeGroup hex={hex} storyboardBuilt={data.storyboardDone} scanned={!page.text && !!page.extractionWarning} />
        <SaveError error={images.save.error} />
        <SaveError error={images.recrop.error} />
      </div>

      <PageDetailLayout label={label} pageId={pageId} page={page} data={data} />

      {images.cropTargetId && data.fullPageSrc && (
        <ImageCropDialog
          imageSrc={data.fullPageSrc}
          initialRect={cropBounds ? pageBoundsToCropRect(cropBounds) : undefined}
          onApply={async (blob) => {
            await images.recrop.mutateAsync({ imageId: images.cropTargetId ?? "", blob })
          }}
          onClose={images.closeCrop}
        />
      )}

      {images.segmentPreview && (
        <SegmentPreviewDialog
          imageSrc={images.segmentPreview.imageSrc}
          imageWidth={images.segmentPreview.imageWidth}
          imageHeight={images.segmentPreview.imageHeight}
          regions={images.segmentPreview.regions}
          onApply={(regions) =>
            images.applySegmentation.mutateAsync({
              imageId: images.segmentPreview?.imageId ?? "",
              regions,
            })
          }
          onClose={images.closeSegmentPreview}
        />
      )}
    </>
  ) : null

  return (
    <StepBody
      title={<Trans>Page {page?.pageNumber ?? pageNumber}</Trans>}
      width="fluid"
      fill
      titleExtra={pageProblem ? <PageProblemChip problem={pageProblem} hex={hex} onAllPages={onClose} /> : undefined}
      actions={
        <>
          <DetailNavButton icon={ChevronLeft} label={t`Previous page`} onClick={() => prevPageId && onStep(prevPageId)} disabled={!prevPageId} />
          <DetailNavButton icon={ChevronRight} label={t`Next page`} onClick={() => nextPageId && onStep(nextPageId)} disabled={!nextPageId} />
          <DetailNavButton icon={LayoutGrid} label={t`All pages`} onClick={onClose}>
            <Trans>All pages</Trans>
          </DetailNavButton>
        </>
      }
    >
      {query.isError && !page ? (
        <PageLoadError pageNumber={pageNumber} onRetry={() => void query.refetch()} />
      ) : (
        <PageDetailLoading label={label} pageId={pageId} pageNumber={pageNumber} ready={!!page} pageSrc={pageSrc}>
          {content}
        </PageDetailLoading>
      )}
    </StepBody>
  )
}
