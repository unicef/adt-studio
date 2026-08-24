import { useMemo } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { usePages } from "@/hooks/use-pages"
import { PageThumb } from "@/components/app/screens/pipeline/canvas/PageThumb"
import { useRunActivity, useStageActivity } from "@/components/app/screens/pipeline/runs/useRunActivity"
import { FloatingSaveProvider } from "@/components/pipeline/components/floating-save"
import { UnsavedChangesGuard } from "@/components/pipeline/components/UnsavedChangesGuard"
import { StepEmpty, StepLoading, StepRunning, StepShell, useStepLoading } from "./shared/StepShell"
import { StepBody, StepRail } from "./shared/ui"
import { usePageDetailKeys } from "./shared/usePageDetailKeys"
import { usePageParam } from "./shared/usePageParam"
import { CaptionsAllImages } from "./captions/CaptionsAllImages"
import { CaptionsPageDetail } from "./captions/CaptionsPageDetail"
import type { StepProps } from "./shared/types"

export function CaptionsStep(props: StepProps) {
  const { label, plugin, pages } = props
  const { t } = useLingui()
  const run = useRunActivity()
  const captions = useStageActivity("captions")
  const pagesQuery = usePages(label)
  const { pageParam, openPage, stepPage, closeDetail } = usePageParam(label, plugin.slug)

  const withImages = useMemo(() => pages.filter((page) => page.imageCount > 0), [pages])
  const totalImages = useMemo(
    () => withImages.reduce((sum, page) => sum + page.imageCount, 0),
    [withImages],
  )
  const missing = useMemo(
    () => withImages.reduce((sum, page) => sum + page.missingCaptions, 0),
    [withImages],
  )
  const hasOutput = useMemo(() => withImages.some((page) => page.hasCaptioning), [withImages])

  const currentIndex = useMemo(
    () => (pageParam ? withImages.findIndex((page) => page.pageId === pageParam) : -1),
    [withImages, pageParam],
  )
  const selectedPage = currentIndex >= 0 ? withImages[currentIndex] : null
  const prevPageId = currentIndex > 0 ? withImages[currentIndex - 1].pageId : null
  const nextPageId =
    currentIndex >= 0 && currentIndex < withImages.length - 1
      ? withImages[currentIndex + 1].pageId
      : null

  usePageDetailKeys({
    enabled: !!selectedPage,
    prevPageId,
    nextPageId,
    onStep: stepPage,
  })

  const loading = useStepLoading(props, {
    isLoading: pagesQuery.isPending,
    hasOutput,
  })

  if (captions.isActive && !hasOutput) {
    return (
      <StepRunning
        {...props}
        stage={captions}
        isCancelling={run.isCancelling}
        onCancel={run.cancelRun}
        outcome={t`Image descriptions show up here as each page is captioned.`}
      />
    )
  }
  if (loading) return <StepLoading {...props} />
  if (!hasOutput) {
    return (
      <StepEmpty
        {...props}
        prerequisites={
          withImages.length === 0
            ? [
                {
                  key: "images",
                  met: false,
                  label: t`Book has images to caption — none found`,
                },
              ]
            : undefined
        }
      />
    )
  }

  return (
    <StepShell
      {...props}
      chips={[
        t`${totalImages} images`,
        missing > 0 ? t`${missing} awaiting captions` : t`All captioned`,
      ]}
      canApply={missing === 0}
      bodyViewportClassName="[&>div]:!my-0"
      rail={
        <StepRail
          heading={<Trans>Images by page</Trans>}
          hex={plugin.hex}
          entries={[
            { key: "", title: t`All pages`, count: totalImages },
            ...withImages.map((page) => ({
              key: page.pageId,
              title: t`Page ${page.pageNumber}`,
              count: page.imageCount,
              subtitle: page.textPreview?.replace(/\n/g, " ") || undefined,
              thumb: (
                <PageThumb
                  label={label}
                  pageId={page.pageId}
                  sectionIndex={null}
                  className="h-[52px] w-[38px]"
                />
              ),
            })),
          ]}
          activeKey={selectedPage?.pageId ?? ""}
          onSelect={(key) => (key ? openPage(key) : closeDetail())}
          footer={<Trans>Counts show how many images each page contributed.</Trans>}
        />
      }
    >
      <FloatingSaveProvider barClassName="bottom-27">
        <UnsavedChangesGuard />
        {selectedPage ? (
          <CaptionsPageDetail
            label={label}
            pageId={selectedPage.pageId}
            accent={plugin.hex}
            prevPageId={prevPageId}
            nextPageId={nextPageId}
            onStep={stepPage}
            onClose={closeDetail}
          />
        ) : (
          <StepBody title={<Trans>Image descriptions</Trans>} meta={t`${totalImages} images`}>
            <CaptionsAllImages
              label={label}
              pages={withImages}
              accent={plugin.hex}
              onOpenPage={openPage}
            />
          </StepBody>
        )}
      </FloatingSaveProvider>
    </StepShell>
  )
}
