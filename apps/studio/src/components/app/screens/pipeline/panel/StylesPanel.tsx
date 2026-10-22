import { Trans, useLingui } from "@lingui/react/macro"
import { useInspectorContext } from "adt-html-editor"
import { HtmlEditor, InspectorBody, InspectorEmpty, InspectorHeader, InspectorPosition, InspectorTransform, InspectorVariants, InspectorLayout, InspectorSpacing, InspectorSizing, InspectorTypography, InspectorAppearance, InspectorBorders, TagInspectorHeader } from "adt-html-editor/shadcn"
import { SlidersHorizontal } from "lucide-react"
import { AppliedStyles } from "../editor/responsive/inspection/AppliedStyles"

function StylesHeader() {
  const { selectedIds } = useInspectorContext()
  if (selectedIds.length !== 1) return <InspectorHeader />
  return <InspectorHeader><TagInspectorHeader /></InspectorHeader>
}

export interface StylesPanelProps {
  editable: boolean
}

export function StylesPanel({ editable }: StylesPanelProps) {
  const { t } = useLingui()

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
    <StylesHeader />
    <InspectorVariants />
    <InspectorEmpty />
    <InspectorBody>
      <AppliedStyles />
      <InspectorPosition />
      <InspectorTransform />
      <div className="flex flex-col">
        <InspectorLayout />
        <InspectorSpacing />
        <HtmlEditor.Inspector.FlowPosition title={t`Position`} />
        <InspectorSizing />
        <InspectorTypography />
        <InspectorAppearance />
        <InspectorBorders />
      </div>
    </InspectorBody>
  </HtmlEditor.Inspector>
}
