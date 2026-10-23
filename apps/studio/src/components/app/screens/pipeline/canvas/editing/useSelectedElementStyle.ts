import { useCallback, useEffect, useState } from "react"
import type { ComputedTypographyStyles } from "@/components/pipeline/stages/storyboard/components/BookPreviewFrame"
import { useCanvasEditing, type CanvasSelection } from "./CanvasEditing"

export type ElementKind = "text" | "image" | "container"

const CONTAINER_TAGS = new Set(["section", "article", "div", "figure", "header", "footer", "main", "aside", "ul", "ol", "nav"])

export function elementKindOf(selection: Pick<CanvasSelection, "dataId" | "tagName">): ElementKind {
  const tag = selection.tagName?.toLowerCase()
  if (tag === "img" || /_im\d+$/.test(selection.dataId)) return "image"
  if (selection.dataId.startsWith("_el") || (!!tag && CONTAINER_TAGS.has(tag) && selection.dataId.startsWith("_"))) {
    return "container"
  }
  return "text"
}

export function useSelectedElementStyle() {
  const { selection, frame, recordEdit, select, sectionHtml } = useCanvasEditing()
  const [classes, setClasses] = useState<string[] | null>(null)
  const [typography, setTypography] = useState<ComputedTypographyStyles | null>(null)
  const draft = selection ? sectionHtml(selection.sectionIndex) : undefined

  useEffect(() => {
    if (!selection) {
      setClasses(null)
      setTypography(null)
      return
    }
    const handle = frame(selection.sectionIndex)
    setClasses(handle?.getElementClasses(selection.dataId) ?? [])
    setTypography(handle?.getComputedTypographyStyles(selection.dataId) ?? null)
  }, [selection, frame, draft])

  const changeClasses = useCallback(
    (dataId: string, next: string[]) => {
      if (!selection) return
      const handle = frame(selection.sectionIndex)
      const html = handle?.setElementClasses(dataId, next)
      if (!handle || !html) return
      setClasses(next)
      void handle.refreshCss(html).then(() => setTypography(handle.getComputedTypographyStyles(dataId)))
      recordEdit(selection.sectionIndex, html)
    },
    [selection, frame, recordEdit],
  )

  const changeStyle = useCallback(
    (dataId: string, property: string, value: string) => {
      if (!selection) return
      const handle = frame(selection.sectionIndex)
      const html = handle?.setElementStyleProp(dataId, property, value)
      if (!handle || !html) return
      setTypography(handle.getComputedTypographyStyles(dataId))
      recordEdit(selection.sectionIndex, html)
    },
    [selection, frame, recordEdit],
  )

  const remove = useCallback(
    (dataId: string) => {
      if (!selection) return
      const removed = frame(selection.sectionIndex)?.removeElement(dataId)
      if (!removed) return
      recordEdit(selection.sectionIndex, removed.html)
      select(null)
    },
    [selection, frame, recordEdit, select],
  )

  return {
    selection,
    kind: selection ? elementKindOf(selection) : null,
    classes,
    typography,
    changeClasses,
    changeStyle,
    remove,
    deselect: () => select(null),
  }
}
