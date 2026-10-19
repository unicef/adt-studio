import type { EditorApi, EditorDocument } from "adt-html-editor"
import { componentOf, flowContainer, layoutClass, layoutOperations, layoutProperties, movableComponent } from "./componentLayout"

const looseText = (element: HTMLElement) => Array.from(element.childNodes).some(node => node.nodeType === Node.TEXT_NODE && node.textContent?.trim())

export function visualChildren(element: HTMLElement) {
  if (!flowContainer(element) || looseText(element)) return []
  const children = Array.from(element.children).filter((child): child is HTMLElement => child instanceof HTMLElement)
  return children.length && children.every(child => movableComponent(child, true)) ? children : []
}

export function rowContainer(element: HTMLElement) {
  let current = element
  let children = visualChildren(current)
  // Headers often have a background wrapper, a padded wrapper, then the row.
  while (children.length === 1 && children[0].tagName === "DIV") {
    current = children[0]; children = visualChildren(current)
  }
  return children.length > 1 ? current : null
}

export function centerContainer(element: HTMLElement) {
  const box = /^(P|H[1-6])$/.test(element.tagName) ? element.parentElement : element
  if (!box) return null
  const children = visualChildren(box)
  // This action is for labels/badges, not whole prose sections or nested cards.
  return children.length > 0 && children.length <= 4 && children.every(child => /^(P|H[1-6])$/.test(child.tagName)
    && !child.querySelector("img, input, textarea, button, svg")) ? box : null
}

export function groupMembers(elements: HTMLElement[]) {
  let members = [...new Set(elements.map(componentOf))]
  // A label selected inside a single-child decorative wrapper represents that
  // wrapper for group alignment. Do not promote across other unselected content.
  for (let step = 0; step < 12 && new Set(members.map(member => member.parentElement)).size > 1; step++) {
    let changed = false
    members = members.map(member => {
      const parent = member.parentElement
      const contents = parent && Array.from(parent.children).filter(child => !(/^(P|H[1-6])$/.test(child.tagName) && !child.textContent?.trim() && !child.children.length))
      if (parent?.tagName === "DIV" && parent.hasAttribute("data-adt-id") && contents?.length === 1 && !looseText(parent)
        && !members.some(other => other !== member && (other === parent || member.contains(other))) && movableComponent(parent)) {
        changed = true; return parent
      }
      return member
    })
    if (!changed) break
  }
  return [...new Set(members)].sort((a, b) => a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1)
}

export function visualOperations(editor: EditorApi, doc: EditorDocument) {
  const { update } = layoutOperations(editor, doc)
  function rowItem(element: HTMLElement) {
    const parent = element.parentElement!
    const parentCss = getComputedStyle(parent)
    const available = parent.clientWidth - parseFloat(parentCss.paddingLeft) - parseFloat(parentCss.paddingRight)
    const ratio = element.getBoundingClientRect().width / available
    // Move the current width to a utility so the mobile override can win over
    // previous inline edits. Large blocks share room; compact objects keep size.
    const width = ratio >= 0.65 ? "w-auto" : `w-[${Math.round(ratio * 100)}%]`
    update(element, /^(?:(?:min-|max-)?w-.*|-?m[trblxyse]?-.*|float-.*|clear-.*|self-.*|justify-self-.*|flex-(?:1|auto|initial|none)|basis-.*|shrink.*|grow.*)$/,
      [width, "min-w-0", "max-w-full", "shrink", "max-sm:w-full"],
      ["width", "min-width", "max-width", "margin", "margin-left", "margin-right", "margin-top", "margin-bottom", "margin-inline", "margin-block", "float", "clear", "align-self", "justify-self", "flex", "flex-basis", "flex-grow", "flex-shrink"])
  }
  function row(container: HTMLElement, alignment: "start" | "center" | "end") {
    const children = visualChildren(container)
    if (children.length < 2) return
    editor.transaction(() => {
      update(container, layoutClass, ["flex", "flex-row", "justify-between", `items-${alignment}`, "gap-6", "max-sm:flex-col", "max-sm:items-center"], layoutProperties)
      children.forEach(rowItem)
      editor.select(container.dataset.adtId!)
    })
  }
  function groupRow(members: HTMLElement[], alignment: "start" | "center" | "end") {
    const parent = members[0]?.parentElement
    const parentId = parent?.dataset.adtId ?? doc.rootId, node = doc.nodes[parentId]
    if (!parent || node?.kind !== "element") return
    if (parent.dataset.adtId && parentId !== doc.rootId && members.length === parent.children.length) { row(parent, alignment); return }
    editor.transaction(() => {
      const wrapper = editor.insertNode({ tag: "div", classes: ["flex", "flex-row", "justify-between", `items-${alignment}`, "gap-6", "max-sm:flex-col", "max-sm:items-center", "w-full", "clear-both"] },
        { parentId, index: node.children.indexOf(members[0].dataset.adtId!) })
      if (!wrapper) return
      members.forEach((member, index) => { rowItem(member); editor.moveNode(member.dataset.adtId!, { parentId: wrapper, index }) })
      editor.select(wrapper)
    })
  }
  function center(container: HTMLElement) {
    const children = visualChildren(container)
    if (!children.length) return
    editor.transaction(() => {
      update(container, layoutClass, ["flex", "flex-col", "items-center", "justify-center", "gap-0"], layoutProperties)
      children.forEach(child => {
        const empty = !child.textContent?.trim() && !child.children.length
        update(child, /^(?:hidden|block|inline-block|text-(?:left|right|center|justify)|(?:min-|max-)?w-.*|-?m[trblxyse]?-.*|self-.*)$/,
          [empty ? "hidden" : "block", "w-full", "min-w-0", "max-w-full", "text-center", "break-words", "m-0"],
          ["display", "width", "min-width", "max-width", "text-align", "margin", "margin-top", "margin-bottom", "margin-left", "margin-right", "align-self"])
      })
      editor.select(container.dataset.adtId!)
    })
  }
  return { row, groupRow, center }
}
