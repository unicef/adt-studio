import { useRef } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { AlertTriangle, ImageOff } from "lucide-react";
import type { PageSummarySection } from "@/api/client";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  CANVAS_PADDING,
  CAPTURE_WIDTH,
  DEVICE_PADDING,
  canvasContentWidth,
  useCanvasPane,
  useCanvasWheelZoom,
} from "./canvasLayout";
import { InteractiveBlock } from "./InteractiveBlock";
import { PageDeviceFrame } from "./PageDeviceFrame";
import { PageEmptyState } from "./PageEmptyState";
import { sectionPreviewUrl } from "./previewUrls";
import type { Viewport } from "@/components/app/screens/pipeline/shared/types";
import type { SectioningRun } from "@/components/app/screens/pipeline/runs/useSectioningRun";
import type { PipelinePage } from "@/components/app/screens/pipeline/shared/usePipelineState";

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
          ? t`Activity in section ${sectionIndex + 1}`
          : t`Section ${sectionIndex + 1}`
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
}: PageCanvasProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const sections = page.sections.filter((s) => !s.isPruned);
  const building =
    !!storyboardRunning && !page.hasRendering && !page.isDiscarded;
  const empty = sections.length === 0 || building;
  const { pane, resizing } = useCanvasPane(scrollRef, !empty);
  useCanvasWheelZoom(scrollRef, zoom, onZoomChange);

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

  const slices = sections.map((section) => (
    <SectionSlice
      key={section.sectionId}
      label={label}
      page={page}
      section={section}
      viewport={viewport}
      contentWidth={contentWidth}
      animateHeight={!resizing}
    />
  ));

  const captionsWarning = page.missingCaptions > 0 && (
    <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] font-medium text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
      <AlertTriangle className="size-3.5 shrink-0" />
      <Trans>This page has images without an alternative description.</Trans>
    </div>
  );

  if (viewport !== "desktop") {
    return (
      <ScrollArea ref={scrollRef} horizontal className="min-h-0 w-full flex-1">
        <div className="flex min-w-max flex-col items-center gap-4 px-6 pb-10 pt-6">
          {captionsWarning}
          <PageDeviceFrame
            viewport={viewport}
            screenWidth={CAPTURE_WIDTH[viewport]}
            zoom={zoom}
            available={{
              width: pane.width - CANVAS_PADDING,
              height: pane.height - DEVICE_PADDING,
            }}
          >
            {slices}
          </PageDeviceFrame>
        </div>
      </ScrollArea>
    );
  }

  return (
    <ScrollArea ref={scrollRef} horizontal className="min-h-0 w-full flex-1">
      <div className="flex min-w-max justify-center px-6 pb-[190px] pt-6">
        <div
          className={cn(
            "flex flex-col gap-4",
            !resizing && "transition-[width] duration-200",
          )}
          style={{ width: contentWidth }}
        >
          {captionsWarning}

          <div className="overflow-hidden rounded-lg bg-card">{slices}</div>
        </div>
      </div>
    </ScrollArea>
  );
}
