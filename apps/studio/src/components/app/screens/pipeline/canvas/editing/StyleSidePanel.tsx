import { StyleEditorPanel } from "@/components/pipeline/stages/storyboard/components/style-editor"
import type { Viewport } from "@/components/app/screens/pipeline/shared/types"
import { useSelectedElementStyle } from "./useSelectedElementStyle"

export function StyleSidePanel({ label, viewport, open, as }: { label: string; viewport: Viewport; open: boolean; as?: "aside" | "div" }) {
  const { selection, kind, classes, typography, changeClasses, changeStyle, remove, deselect } = useSelectedElementStyle()

  return (
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
    />
  )
}
