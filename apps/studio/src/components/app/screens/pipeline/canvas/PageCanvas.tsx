import { useEffect, useRef } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { AlertTriangle, ImageOff } from "lucide-react";
import type { PageSummarySection } from "@/api/client";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  CAPTURE_WIDTH,
  canvasContentWidth,
  canvasDeviceFit,
  desktopFitScale,
  deviceAvailable,
  publishCanvasFit,
  useCanvasPane,
  useCanvasWheelZoom,
} from "./canvasLayout";
import { InteractiveBlock } from "./InteractiveBlock";
import { PageDeviceFrame } from "./PageDeviceFrame";
import { PageEmptyState } from "./PageEmptyState";
import { sectionPreviewUrl } from "./previewUrls";
import { useCanvasEditing } from "./editing/CanvasEditing";
import { EditableSectionSlice } from "./editing/EditableSectionSlice";
import { SectionFrame } from "./editing/SectionFrame";
import { withPendingPrune } from "./editing/sectioningDraft";
import { useStoryboardTools } from "./tools/StoryboardToolsContext";
import type { Viewport } from "@/components/app/screens/pipeline/shared/types";
import type { SectioningRun } from "@/components/app/screens/pipeline/runs/useSectioningRun";
import type { PipelinePage } from "@/components/app/screens/pipeline/shared/usePipelineState";
import { useDockMinimized } from "@/components/app/screens/pipeline/shared/workspacePrefs";

const SECTION_FRAME_HEIGHT = 640;

export interface PageCanvasProps {
  label: string;
  page: PipelinePage;
  viewport: Viewport;
  zoom: number;
  onZoomChange: (zoom: number) => void;
  sectioning: SectioningRun;
  storyboardRunning?: boolean;
  onOpenSectioning: () => void;
  notice?: React.ReactNode;
}

function SectionSlice({
  label,
  page,
  section,
  viewport,
  contentWidth,
  animateHeight,
}: {
  label: string;
  page: PipelinePage;
  section: PageSummarySection;
  viewport: Viewport;
  contentWidth: number;
  animateHeight: boolean;
}) {
  const { t } = useLingui();
  const sectionIndex = section.sectionIndex;

  if (!page.hasRendering) {
    return (
      <div className="flex flex-col items-center gap-2 border-b border-dashed py-14 text-muted-foreground last:border-b-0">
        <ImageOff className="size-5" />
        <span className="text-[12.5px]">
          <Trans>No preview rendered for this section yet</Trans>
        </span>
      </div>
    );
  }

  return (
    <InteractiveBlock
      src={sectionPreviewUrl(
        label,
        page.pageId,
        sectionIndex,
        page.renderingVersion,
      )}
      frameTitle={
        section.isActivity
          ? t`Page ${page.pageNumber}, activity in section ${sectionIndex + 1}`
          : t`Page ${page.pageNumber}, section ${sectionIndex + 1}`
      }
      frameWidth={CAPTURE_WIDTH[viewport]}
      frameHeight={SECTION_FRAME_HEIGHT}
      displayWidth={contentWidth}
      animateHeight={animateHeight}
      className="border-b last:border-b-0"
    />
  );
}

export function PageCanvas({
  label,
  page,
  viewport,
  zoom,
  onZoomChange,
  sectioning,
  storyboardRunning,
  onOpenSectioning,
  notice,
}: PageCanvasProps) {
  const { t } = useLingui();
  const scrollRef = useRef<HTMLDivElement>(null);
  const editing = useCanvasEditing();
  const highlighted = useStoryboardTools()?.highlighted ?? null;
  const sections = withPendingPrune(page.sections, editing.pendingSectioning);
  const building =
    !!storyboardRunning && !page.hasRendering && !page.isDiscarded;
  const empty = sections.length === 0 || building;
  const { pane, resizing } = useCanvasPane(scrollRef, !empty);
  const [dockMinimized] = useDockMinimized();
  useCanvasWheelZoom(scrollRef, zoom, onZoomChange);
  const available = deviceAvailable(pane, dockMinimized);
  const fit =
    viewport === "desktop"
      ? desktopFitScale(pane)
      : canvasDeviceFit(viewport, available);
  useEffect(() => {
    if (!empty) publishCanvasFit(fit);
  }, [empty, fit]);

  if (empty) {
    return (
      <div className="flex min-h-0 w-full flex-1 items-center justify-center px-6 pb-24">
        <PageEmptyState
          label={label}
          page={page}
          sectioning={sectioning}
          storyboardRunning={storyboardRunning}
          onOpenSectioning={onOpenSectioning}
        />
      </div>
    );
  }

  const contentWidth = canvasContentWidth(viewport, pane, zoom);
  const pageScale =
    viewport === "desktop" ? contentWidth / CAPTURE_WIDTH.desktop : undefined;

  const slices = sections.map((section) => (
    <SectionFrame
      key={section.sectionId}
      sectionIndex={section.sectionIndex}
      pruned={section.isPruned}
      highlighted={highlighted === section.sectionIndex}
    >
      {editing.enabled && page.hasRendering ? (
        <EditableSectionSlice
          label={label}
          pageId={page.pageId}
          pageNumber={page.pageNumber}
          section={section}
          viewport={viewport}
          maxScale={pageScale}
        />
      ) : (
        <SectionSlice
          label={label}
          page={page}
          section={section}
          viewport={viewport}
          contentWidth={contentWidth}
          animateHeight={!resizing}
        />
      )}
    </SectionFrame>
  ));

  const captionsWarning = page.missingCaptions > 0 && (
    <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] font-medium text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
      <AlertTriangle className="size-3.5 shrink-0" />
      <Trans>This page has images without an alternative description.</Trans>
    </div>
  );

  if (viewport !== "desktop") {
    return (
      <ScrollArea ref={scrollRef} horizontal viewportLabel={t`Page ${page.pageNumber}`} className="min-h-0 w-full flex-1">
        <div
          className={cn(
            "flex min-w-max flex-col items-center gap-4 px-6 pt-16 transition-[padding] duration-300 ease-out motion-reduce:transition-none",
            dockMinimized ? "pb-10" : "pb-24",
          )}
        >
          {notice}
          {captionsWarning}
          <PageDeviceFrame
            viewport={viewport}
            screenWidth={CAPTURE_WIDTH[viewport]}
            zoom={zoom}
            available={available}
          >
            {slices}
          </PageDeviceFrame>
        </div>
      </ScrollArea>
    );
  }

  return (
    <ScrollArea ref={scrollRef} horizontal viewportLabel={t`Page ${page.pageNumber}`} className="min-h-0 w-full flex-1">
      <div className="flex min-w-max justify-center px-6 pb-[190px] pt-16">
        <div
          className={cn(
            "flex flex-col gap-4",
            !resizing && "transition-[width] duration-200",
          )}
          style={{ width: contentWidth }}
        >
          {notice}
          {captionsWarning}

          <div className="overflow-hidden rounded-lg bg-card">{slices}</div>
        </div>
      </div>
    </ScrollArea>
  );
}
