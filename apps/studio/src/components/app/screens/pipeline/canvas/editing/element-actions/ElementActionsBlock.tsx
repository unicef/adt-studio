import type { StyleEditorElementProps } from "@/components/pipeline/stages/storyboard/components/style-editor/ElementActions"
import { STORYBOARD_HEX } from "@/components/app/screens/pipeline/shared/plugins"
import { ImageActionsCard } from "./ImageActionsCard"
import { TextTypeSwitcher } from "./TextTypeSwitcher"

export function ElementActionsBlock({ dataId, elementProps }: { dataId: string; elementProps: StyleEditorElementProps }) {
  if (elementProps.isImage)
    return (
      <div style={{ ["--chrome-hex" as string]: STORYBOARD_HEX }}>
        <ImageActionsCard dataId={dataId} elementProps={elementProps} />
      </div>
    )
  if (!elementProps.isContainer && elementProps.textTypes && elementProps.onChangeTextType)
    return (
      <div style={{ ["--chrome-hex" as string]: STORYBOARD_HEX }}>
        <TextTypeSwitcher dataId={dataId} textType={elementProps.textType} textTypes={elementProps.textTypes} onChange={elementProps.onChangeTextType} />
      </div>
    )
  return null
}
