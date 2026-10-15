import { useEffect, useState } from "react"
import { StyleEditorPanel } from "@/components/pipeline/stages/storyboard/components/style-editor"
import type { ComputedTypographyStyles } from "@/components/pipeline/stages/storyboard/components/BookPreviewFrame"
import type { Viewport } from "@/components/app/screens/pipeline/shared/types"
import { useCanvasEditing, type CanvasSelection } from "./CanvasEditing"

const CONTAINER_TAGS = new Set(["section", "article", "div", "figure", "header", "footer", "main", "aside", "ul", "ol", "nav"])

function elementPropsFor(selection: CanvasSelection | null, onDelete: (dataId: string) => void) {
  if (!selection) return null
  const tag = selection.tagName?.toLowerCase()
  const isImage = tag === "img" || /_im\d+$/.test(selection.dataId)
  const isContainer = !isImage && (selection.dataId.startsWith("_el") || (!!tag && CONTAINER_TAGS.has(tag) && selection.dataId.startsWith("_")))
  return { isImage, isContainer, onDelete }
}

export function StyleSidePanel({ label, viewport, open }: { label: string; viewport: Viewport; open: boolean }) {
  const { selection, frame, recordEdit, select } = useCanvasEditing()
  const [classes, setClasses] = useState<string[] | null>(null)
  const [typography, setTypography] = useState<ComputedTypographyStyles | null>(null)

  useEffect(() => {
    if (!selection) {
      setClasses(null)
      setTypography(null)
      return
    }
    const handle = frame(selection.sectionIndex)
    setClasses(handle?.getElementClasses(selection.dataId) ?? [])
    setTypography(handle?.getComputedTypographyStyles(selection.dataId) ?? null)
  }, [selection, frame])

  return (
    <StyleEditorPanel
      open={open && !!selection}
      onClose={() => select(null)}
      selectedDataId={selection?.dataId ?? null}
      selectedTagName={selection?.tagName ?? null}
      elementClasses={classes}
      elementProps={elementPropsFor(selection, (dataId) => {
        if (!selection) return
        const removed = frame(selection.sectionIndex)?.removeElement(dataId)
        if (!removed) return
        recordEdit(selection.sectionIndex, removed.html)
        select(null)
      })}
      computedTypography={typography}
      deviceView={viewport}
      bookLabel={label}
      onClassesChange={(dataId, next) => {
        if (!selection) return
        const handle = frame(selection.sectionIndex)
        const html = handle?.setElementClasses(dataId, next)
        if (!handle || !html) return
        setClasses(next)
        void handle.refreshCss(html)
        recordEdit(selection.sectionIndex, html)
      }}
      onStyleChange={(dataId, property, value) => {
        if (!selection) return
        const handle = frame(selection.sectionIndex)
        const html = handle?.setElementStyleProp(dataId, property, value)
        if (!handle || !html) return
        setTypography(handle.getComputedTypographyStyles(dataId))
        recordEdit(selection.sectionIndex, html)
      }}
    />
  )
}
