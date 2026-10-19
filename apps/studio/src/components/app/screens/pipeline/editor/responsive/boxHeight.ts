import type { EditorApi, EditorDocument } from "adt-html-editor"
import { layoutOperations, movableComponent } from "./componentLayout"
import { mergedStyle } from "./flowLayout"

export function heightFrames(element: HTMLElement, locked: Record<string, boolean>) {
  if (!/^(DIV|HEADER|SECTION|ASIDE|ARTICLE)$/.test(element.tagName) || !movableComponent(element)) return []
  const descendants = [element, ...element.querySelectorAll<HTMLElement>("[data-adt-id]")]
  if (descendants.some(child => locked[child.dataset.adtId ?? ""]
    || ["absolute", "fixed", "sticky"].includes(getComputedStyle(child).position))) return []
  for (let current = element.parentElement; current; current = current.parentElement) {
    if (locked[current.dataset.adtId ?? ""]) return []
  }
  const frames = [element]
  let current = element
  while (current.children.length === 1 && current.firstElementChild instanceof HTMLElement
    && current.firstElementChild.tagName === "DIV" && movableComponent(current.firstElementChild)
    && !Array.from(current.childNodes).some(node => node.nodeType === Node.TEXT_NODE && node.textContent?.trim())) {
    current = current.firstElementChild
    frames.push(current)
  }
  return frames
}

export function measureHeight(frames: HTMLElement[]) {
  const root = frames[0]
  const originalHeight = root.getBoundingClientRect().height
  const entries = frames.map(element => {
    const css = getComputedStyle(element)
    return { element, initial: element.getAttribute("style"), top: parseFloat(css.paddingTop), bottom: parseFloat(css.paddingBottom) }
  })
  const restore = () => entries.forEach(({ element, initial }) => {
    if (initial === null) element.removeAttribute("style")
    else element.setAttribute("style", initial)
  })
  entries.forEach(({ element, initial }) => element.setAttribute("style", mergedStyle(initial, { height: "auto", "min-height": "0px", "max-height": "none" })))
  const naturalHeight = root.getBoundingClientRect().height
  restore()
  const padding = entries.reduce((sum, entry) => sum + entry.top + entry.bottom, 0)
  function patches(requested: number) {
    const height = Math.max(0, Math.min(1600, Math.round(requested)))
    const fraction = padding ? Math.min(1, Math.max(0, naturalHeight - height) / padding) : 0
    return entries.map(({ element, top, bottom }, index) => ({ element,
      height: index === 0 ? height : 0,
      top: Math.round(top * (1 - fraction)), bottom: Math.round(bottom * (1 - fraction)),
      center: index === 0 && entries.length > 1,
    }))
  }
  function preview(requested: number) {
    const changes = patches(requested)
    changes.forEach(({ element, height, top, bottom, center }, index) => element.setAttribute("style", mergedStyle(entries[index].initial, {
      height: "auto", "min-height": `${height}px`, "max-height": "none", "box-sizing": "border-box",
      "padding-top": `${top}px`, "padding-bottom": `${bottom}px`,
      ...(center ? { display: "flex", "flex-direction": "column", "justify-content": "center" } : {}),
    })))
    return { changes, actual: Math.round(root.getBoundingClientRect().height) }
  }
  return { originalHeight, restore, preview }
}

export function commitHeight(editor: EditorApi, doc: EditorDocument, changes: ReturnType<ReturnType<typeof measureHeight>["preview"]>["changes"]) {
  const { update } = layoutOperations(editor, doc)
  editor.transaction(() => changes.forEach(({ element, height, top, bottom, center }) => {
    const remove = center ? /^(?:(?:min-|max-)?h-.*|p[tyb]-.*|box-(?:border|content)|block|grid|inline-grid|flex|inline-flex|flex-(?:row|col)(?:-reverse)?|justify-.*)$/
      : /^(?:(?:min-|max-)?h-.*|p[tyb]-.*|box-(?:border|content))$/
    update(element, remove, ["h-auto", `min-h-[${height}px]`, "max-h-none", "box-border", `pt-[${top}px]`, `pb-[${bottom}px]`,
      ...(center ? ["flex", "flex-col", "justify-center"] : [])],
    ["height", "min-height", "max-height", "padding-top", "padding-bottom", "padding-block", "box-sizing",
      ...(center ? ["display", "flex-direction", "justify-content"] : [])])
  }))
}
