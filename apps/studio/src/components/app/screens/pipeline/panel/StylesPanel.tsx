import { Trans } from "@lingui/react/macro"
import { HtmlEditor, InspectorBody, InspectorEmpty, InspectorPosition, InspectorTransform, InspectorVariants, InspectorLayout, InspectorSpacing, InspectorSizing, InspectorTypography, InspectorAppearance, InspectorBorders } from "adt-html-editor/shadcn"
import { SlidersHorizontal } from "lucide-react"
import { AppliedStyles } from "../editor/responsive/inspection/AppliedStyles"
import { PositionSection } from "../editor/responsive/position/PositionSection"
import { TagInspectorHeader } from "../editor/responsive/tags/TagInspectorHeader"

export interface StylesPanelProps {
  editable: boolean
}

export function StylesPanel({ editable }: StylesPanelProps) {
  if (!editable) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center text-muted-foreground">
        <span className="grid size-9 place-items-center rounded-[10px] bg-muted">
          <SlidersHorizontal className="size-4" />
        </span>
        <span className="text-[11.5px] leading-relaxed text-pretty">
          <Trans>Open a rendered page to style its elements.</Trans>
        </span>
      </div>
    )
  }

  return <HtmlEditor.Inspector className="min-h-0 min-w-0 flex-1 border-l-0 bg-transparent">
    <TagInspectorHeader />
    <InspectorVariants />
    <InspectorEmpty />
    <InspectorBody>
      <AppliedStyles />
      <InspectorPosition />
      <InspectorTransform />
      <div className="flex flex-col">
        <InspectorLayout />
        <InspectorSpacing />
        <PositionSection />
        <InspectorSizing />
        <InspectorTypography />
        <InspectorAppearance />
        <InspectorBorders />
      </div>
    </InspectorBody>
  </HtmlEditor.Inspector>
}
