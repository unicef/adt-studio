import { memo, useMemo } from "react"
import { useLingui } from "@lingui/react/macro"
import { useLayoutMode } from "adt-html-editor"
import { HtmlEditor } from "adt-html-editor/shadcn"
import type { Viewport } from "@/components/app/screens/pipeline/shared/types"
import { CanvasWidthControl } from "./CanvasWidthControl"
import { SectionTabs } from "./SectionTabs"
import type { EditorSection } from "./useStoryboardEditor"

export interface EditorCanvasProps {
  pageId: string
  sections: EditorSection[]
  activeSectionIndex: number | null
  onSelectSection: (pageId: string, sectionIndex: number) => void
  viewport: Viewport
  onViewportChange: (viewport: Viewport) => void
}

const CanvasBody = memo(function CanvasBody({ fixed }: { fixed: boolean }) {
  if (!fixed) return <HtmlEditor.Canvas.Viewport />
  return (
    <HtmlEditor.Canvas.FixedPage>
      <HtmlEditor.Canvas.Guides />
      <HtmlEditor.Canvas.LiveGhost />
      <HtmlEditor.Canvas.Handles />
    </HtmlEditor.Canvas.FixedPage>
  )
})

export const EditorCanvas = memo(function EditorCanvas({
  pageId,
  sections,
  activeSectionIndex,
  onSelectSection,
  viewport,
  onViewportChange,
}: EditorCanvasProps) {
  const { t } = useLingui()
  const layout = useLayoutMode()
  const fixed = layout === "fixed"

  const zoomLevels = useMemo(
    () => [
      { id: "fit", label: t`Fit`, zoom: "fit" as const },
      { id: "50", label: "50%", zoom: 0.5 },
      { id: "100", label: "100%", zoom: 1 },
      { id: "200", label: "200%", zoom: 2 },
    ],
    [t],
  )

  return (
    <HtmlEditor.Canvas className="min-h-0 w-full flex-1 bg-transparent">
      <HtmlEditor.Canvas.Toolbar className="h-12 gap-3 bg-card px-3">
        <HtmlEditor.History />
        {fixed ? (
          <HtmlEditor.Canvas.Zoom levels={zoomLevels} />
        ) : (
          <CanvasWidthControl viewport={viewport} onViewportChange={onViewportChange} />
        )}
      </HtmlEditor.Canvas.Toolbar>

      {sections.length > 1 && (
        <div className="flex h-10 shrink-0 items-center border-b bg-card px-3">
          <SectionTabs
            pageId={pageId}
            sections={sections}
            activeSectionIndex={activeSectionIndex}
            onSelect={onSelectSection}
          />
        </div>
      )}

      <CanvasBody fixed={fixed} />
    </HtmlEditor.Canvas>
  )
})
