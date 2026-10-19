import type { EditorApi, EditorDocument } from "adt-html-editor"
import { flowContainer, layoutOperations, mediaGroup, movableComponent } from "./componentLayout"

export function wrapObject(element: HTMLElement) {
  return /^(ASIDE|FIGURE|IMG)$/.test(element.tagName) || mediaGroup(element)
    || getComputedStyle(element).float !== "none"
    || Array.from(element.classList).some(value => /(^|:)float-(left|right)$/.test(value))
}

// Only unadorned layout wrappers are traversed. Cards, activities, semantic
// sections and diagrams remain boundaries; no node or authored ID is deleted.
function layoutWrapper(element: HTMLElement) {
  const css = getComputedStyle(element)
  return element.tagName === "DIV" && movableComponent(element)
    // eslint-disable-next-line lingui/no-unlocalized-strings -- DOM selector, not visible copy
    && !element.matches("[role], [data-activity-item], [data-section-id]")
    && css.backgroundColor === "rgba(0, 0, 0, 0)" && css.backgroundImage === "none"
    && [css.paddingTop, css.paddingRight, css.paddingBottom, css.paddingLeft,
      css.borderTopWidth, css.borderRightWidth, css.borderBottomWidth, css.borderLeftWidth].every(value => parseFloat(value) === 0)
    && css.overflowX === "visible" && css.overflowY === "visible"
}

function inspect(element: HTMLElement, object?: HTMLElement): { texts: HTMLElement[]; objects: HTMLElement[]; wrappers: HTMLElement[] } | null {
  if (!movableComponent(element) || getComputedStyle(element).display === "none") return null
  if (element === object || wrapObject(element)) return { texts: [], objects: [element], wrappers: [] }
  if (element.tagName === "P" && !element.querySelector("img, input, textarea, button, select, iframe, svg, math")) {
    const css = getComputedStyle(element)
    return css.overflowX === "visible" && css.overflowY === "visible" ? { texts: [element], objects: [], wrappers: [] } : null
  }
  if (!layoutWrapper(element)) return null
  const contents = inspectChildren(element, object)
  return contents && { ...contents, wrappers: [element, ...contents.wrappers] }
}

function inspectChildren(element: HTMLElement, object?: HTMLElement) {
  if (Array.from(element.childNodes).some(node => node.nodeType !== Node.ELEMENT_NODE
    && node.nodeType !== Node.COMMENT_NODE && node.textContent?.trim())) return null
  const parts = Array.from(element.children).map(child => child instanceof HTMLElement ? inspect(child, object) : null)
  if (parts.some(part => !part)) return null
  return {
    texts: parts.flatMap(part => part!.texts), objects: parts.flatMap(part => part!.objects),
    wrappers: parts.flatMap(part => part!.wrappers),
  }
}

function plan(parent: HTMLElement, members: HTMLElement[], object?: HTMLElement, anchor?: HTMLElement) {
  if (!members.length) return null
  const nodes = Array.from(parent.childNodes)
  const range = nodes.slice(nodes.indexOf(members[0]), nodes.indexOf(members.at(-1)!) + 1)
  if (range.some(node => node.nodeType === Node.TEXT_NODE && node.textContent?.trim())) return null
  const parts = members.map(member => inspect(member, object))
  if (parts.some(part => !part)) return null
  const texts = parts.flatMap(part => part!.texts), objects = parts.flatMap(part => part!.objects)
  const floating = object ?? (objects.length === 1 ? objects[0] : undefined)
  if (!texts.length || !floating || objects.some(candidate => candidate !== floating)) return null
  return { parent, members, object: floating, texts, wrappers: parts.flatMap(part => part!.wrappers), anchor: anchor ?? texts[0] }
}

export function containerTextFlow(container: HTMLElement) {
  if (!flowContainer(container) || wrapObject(container)) return null
  const contents = inspectChildren(container)
  if (!contents || contents.objects.length !== 1 || !contents.texts.length) return null
  return plan(container, Array.from(container.children) as HTMLElement[], contents.objects[0])
}

export function surroundingTextFlow(object: HTMLElement, target?: HTMLElement) {
  if (!movableComponent(object)) return null
  let branch = target ?? object
  let result: ReturnType<typeof plan> = null
  for (let parent = branch.parentElement; parent && flowContainer(parent); parent = branch.parentElement) {
    const siblings = Array.from(parent.children) as HTMLElement[]
    const valid = (element: HTMLElement) => {
      const info = inspect(element, object)
      return info && info.objects.every(candidate => candidate === object)
    }
    const index = siblings.indexOf(branch)
    if (index < 0 || !valid(branch)) break
    let start = index, end = index
    while (start > 0 && valid(siblings[start - 1])) start--
    while (end + 1 < siblings.length && valid(siblings[end + 1])) end++
    const candidate = plan(parent, siblings.slice(start, end + 1), object, target)
    if (candidate) result = candidate
    if (!layoutWrapper(parent) || getComputedStyle(parent).display === "flow-root" || start !== 0 || end !== siblings.length - 1) break
    branch = parent
  }
  return result
}

export function selectedTextFlow(component: HTMLElement) {
  const container = containerTextFlow(component)
  // Selecting an inner grid should still include the neighbouring paragraphs
  // separated by its outer layout wrapper, just as selecting the aside does.
  return container ? surroundingTextFlow(container.object) ?? container
    : wrapObject(component) || component.tagName === "DIV" ? surroundingTextFlow(component) : null
}

export function groupTextFlow(members: HTMLElement[]) {
  return members[0]?.parentElement ? plan(members[0].parentElement, members) : null
}

export function applyTextFlow(editor: EditorApi, doc: EditorDocument, layout: NonNullable<ReturnType<typeof selectedTextFlow>>, side: "left" | "right") {
  const parentId = layout.parent.dataset.adtId ?? doc.rootId
  const parent = doc.nodes[parentId]
  if (parent?.kind !== "element") return false
  const ops = layoutOperations(editor, doc)
  let applied = false
  editor.transaction(() => {
    const wholeContainer = layout.members.length === layout.parent.children.length && parentId !== doc.rootId
      && !Array.from(layout.parent.childNodes).some(node => node.nodeType === Node.TEXT_NODE && node.textContent?.trim())
    let rootId = parentId
    if (wholeContainer) ops.textFlowBox(layout.parent, "root")
    else {
      const wrapper = editor.insertNode({ tag: "div", classes: ["flow-root", "w-full", "min-w-0"] },
        { parentId, index: parent.children.indexOf(layout.members[0].dataset.adtId!) })
      if (!wrapper) return
      rootId = wrapper
      layout.members.forEach((member, index) => editor.moveNode(member.dataset.adtId!, { parentId: rootId, index }))
    }
    layout.wrappers.forEach(element => ops.textFlowBox(element, "wrapper"))
    layout.texts.forEach(element => ops.textFlowBox(element, "text"))
    // Float before the paragraph's outer wrapper, so subsequent paragraphs can
    // wrap too. Wrappers remain ordinary blocks; only the flow root contains it.
    const anchor = layout.members.find(member => member === layout.anchor || member.contains(layout.anchor))!
    const index = wholeContainer ? parent.children.indexOf(anchor.dataset.adtId!) : layout.members.indexOf(anchor)
    editor.moveNode(layout.object.dataset.adtId!, { parentId: rootId, index })
    ops.floatSide(layout.object, side)
    editor.select(layout.object.dataset.adtId!)
    applied = true
  })
  return applied
}
