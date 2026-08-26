import { useCallback, useMemo } from "react"
import { useLingui } from "@lingui/react/macro"
import type { PageDetail } from "@/api/client"
import { ReadyOnMount } from "@/components/pipeline/components/LazyThumb"
import { VersionPicker } from "@/components/pipeline/components/VersionPicker"
import type { VersionPreviewRenderOptions } from "@/components/pipeline/components/VersionPreviewCompareDialog"
import { BookPreviewFrame } from "@/components/pipeline/stages/storyboard/components/BookPreviewFrame"
import { DEVICE_WIDTHS } from "@/components/pipeline/stages/storyboard/components/style-editor/device-breakpoint"
import { detectChangedStoryboardViewports } from "@/components/pipeline/stages/storyboard/lib/storyboard-viewport-changes"
import type { Viewport } from "@/components/app/screens/pipeline/shared/types"
import type { PipelinePage } from "@/components/app/screens/pipeline/shared/usePipelineState"

type RenderingData = NonNullable<PageDetail["rendering"]>

const NOOP = () => undefined

const TRIGGER =
  "bg-muted font-mono text-muted-foreground hover:bg-accent hover:text-foreground"

function renderedSection(data: unknown, sectionIndex: number) {
  return (data as RenderingData | null | undefined)?.sections.find(
    (section) => section.sectionIndex === sectionIndex,
  )
}

export interface StoryboardVersionPickerProps {
  label: string
  page: PipelinePage
  viewport: Viewport
}

/**
 * Rendering history for the page on the canvas, in the workspace top bar.
 *
 * The classic storyboard hung this off the section detail, so its previews were
 * scoped to the open section. The canvas is page-scoped, and a version covers
 * the whole page's rendering, so the thumbnails stand in for the page with its
 * first live section — the same section the AI edit panel targets by default.
 */
export function StoryboardVersionPicker({
  label,
  page,
  viewport,
}: StoryboardVersionPickerProps) {
  const { t } = useLingui()
  const sectionIndex = useMemo(
    () => page.sections.find((section) => !section.isPruned)?.sectionIndex ?? 0,
    [page.sections],
  )

  const getChangedPreviewViewports = useCallback(
    (currentData: unknown, selectedData: unknown) =>
      detectChangedStoryboardViewports(
        renderedSection(currentData, sectionIndex)?.html ?? "",
        renderedSection(selectedData, sectionIndex)?.html ?? "",
      ),
    [sectionIndex],
  )

  const renderPreview = useCallback(
    (data: unknown, onReady?: () => void, opts?: VersionPreviewRenderOptions) => {
      const section = renderedSection(data, sectionIndex)
      if (!section) {
        return (
          <ReadyOnMount onReady={onReady}>
            <div className="flex h-full items-center justify-center p-2 text-center text-[11px] text-muted-foreground">
              {t`This page doesn't exist in this version.`}
            </div>
          </ReadyOnMount>
        )
      }
      const previewViewport = opts?.viewport ?? (opts?.lite ? "desktop" : viewport)
      return (
        <BookPreviewFrame
          html={section.html}
          bookLabel={label}
          editable={false}
          renderWidth={DEVICE_WIDTHS[previewViewport]}
          deviceView={previewViewport}
          maxVisibleHeight={opts?.maxHeight}
          thumbnail={Boolean(opts?.lite)}
          autoRefreshCss={!opts?.lite}
          applyBodyBackground
          onReady={onReady}
        />
      )
    },
    [label, sectionIndex, t, viewport],
  )

  return (
    <VersionPicker
      step="web-rendering"
      itemId={page.pageId}
      currentVersion={page.renderingVersion}
      bookLabel={label}
      saving={false}
      dirty={false}
      renderSaveBar={false}
      onRestored={NOOP}
      onDiscard={NOOP}
      previewViewport={viewport}
      getChangedPreviewViewports={getChangedPreviewViewports}
      renderPreview={renderPreview}
      triggerClassName={TRIGGER}
    />
  )
}
