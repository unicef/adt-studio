import { StyleEditorPanel } from "@/components/pipeline/stages/storyboard/components/style-editor"
import type { Viewport } from "@/components/app/screens/pipeline/shared/types"
import { useSelectedElementStyle } from "./useSelectedElementStyle"
import { SectionElementDialogs } from "@/components/pipeline/stages/storyboard/components/SectionElementDialogs"
import { ElementActionsBlock } from "./element-actions/ElementActionsBlock"
import { useCanvasElementActions } from "./element-actions/useCanvasElementActions"

export function StyleSidePanel({ label, viewport, open, as }: { label: string; viewport: Viewport; open: boolean; as?: "aside" | "div" }) {
  const { selection, kind, classes, typography, changeClasses, changeStyle, remove, deselect } = useSelectedElementStyle()
  const elementActions = useCanvasElementActions(label, remove)

  return (
    <>
    <StyleEditorPanel
      as={as}
      open={open && !!selection}
      onClose={deselect}
      selectedDataId={selection?.dataId ?? null}
      selectedTagName={selection?.tagName ?? null}
      elementClasses={classes}
      elementProps={kind ? { isImage: kind === "image", isContainer: kind === "container", onDelete: remove } : null}
      computedTypography={typography}
      deviceView={viewport}
      bookLabel={label}
      onClassesChange={changeClasses}
      onStyleChange={changeStyle}
      {...elementActions.panelProps}
      renderElementActions={(dataId, elementProps) => <ElementActionsBlock dataId={dataId} elementProps={elementProps} />}
    />
    <SectionElementDialogs actions={elementActions.actions} />
    </>
  )
}
