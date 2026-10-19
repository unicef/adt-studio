import type { EditorApi, EditorDocument } from "adt-html-editor"

export function mediaGroup(element: HTMLElement): boolean {
  if (!/^(DIV|FIGURE)$/.test(element.tagName) || element.querySelectorAll("img").length !== 1) return false
  if (element.tagName === "FIGURE") return true
  if (Array.from(element.children).filter(child => child.tagName === "P").length > 1) return false
  return Array.from(element.children).every(child => child.tagName === "IMG"
    // This is a selector for component structure, not visible text.
    // eslint-disable-next-line lingui/no-unlocalized-strings
    || child.matches("figcaption, .adt-caption")
    || child.tagName === "P"
    || (child instanceof HTMLElement && getComputedStyle(child).position === "absolute")
    || (child instanceof HTMLElement && mediaGroup(child)))
}

function withResizeContainer(element: HTMLElement) {
  const parent = element.parentElement
  return parent?.hasAttribute("data-responsive-container") && parent.children.length === 1 ? parent : element
}

export function componentOf(element: HTMLElement) {
  const semantic = element.closest<HTMLElement>("figure, aside")
  if (semantic?.closest(".adt-canvas")) return withResizeContainer(semantic)
  if (/^(SPAN|EM|STRONG|B|I|A|SMALL|MARK|SUB|SUP)$/.test(element.tagName)) {
    const paragraph = element.closest<HTMLElement>("p, h1, h2, h3, h4, h5, h6, blockquote")
    if (paragraph?.closest(".adt-canvas")) return withResizeContainer(paragraph)
  }
  let component = element
  if (element.tagName === "IMG") {
    const paragraph = element.parentElement
    if (paragraph?.tagName === "P" && paragraph.children.length === 1
      && !Array.from(paragraph.childNodes).some(node => node.nodeType === Node.TEXT_NODE && node.textContent?.trim())) return withResizeContainer(paragraph)
    while (component.parentElement?.hasAttribute("data-adt-id") && mediaGroup(component.parentElement)) component = component.parentElement
  }
  return withResizeContainer(component)
}

export function movableComponent(element: HTMLElement, allowInlineBox = false) {
  if (!element.hasAttribute("data-adt-id") || !/^(DIV|SECTION|ARTICLE|MAIN|ASIDE|FIGURE|HEADER|FOOTER|NAV|BLOCKQUOTE|P|H[1-6]|IMG)$/.test(element.tagName)) return false
  for (let current: HTMLElement | null = element; current && !current.classList.contains("adt-canvas"); current = current.parentElement) {
    const css = getComputedStyle(current)
    if (current !== element && /^(P|A|SPAN|LABEL|BUTTON|PICTURE|UL|OL|LI|DL|DT|DD|H[1-6])$/.test(current.tagName)) return false
    if (css.transform !== "none" || (css.rotate && css.rotate !== "none") || (css.scale && css.scale !== "none")
      || css.writingMode !== "horizontal-tb" || css.display.includes("table") || css.display === "contents"
      || (current === element && (css.order !== "0" || css.gridColumnStart !== "auto" || css.gridRowStart !== "auto"))
      || (current === element && (["absolute", "fixed", "sticky"].includes(css.position)
        || (css.display.startsWith("inline") && !(allowInlineBox && css.display !== "inline"))))) return false
  }
  const parentStyle = element.parentElement && getComputedStyle(element.parentElement)
  if (parentStyle?.flexDirection.endsWith("reverse") || parentStyle?.gridAutoFlow.includes("dense")) return false
  return true
}

export function flowContainer(element: HTMLElement) {
  return element.classList.contains("adt-canvas") || (/^(DIV|SECTION|ARTICLE|MAIN|ASIDE|HEADER|FOOTER|NAV|BLOCKQUOTE)$/.test(element.tagName) && movableComponent(element))
}

export function layoutChildren(element: HTMLElement) {
  if (!/^(DIV|SECTION|ARTICLE|MAIN|ASIDE|FIGURE|HEADER|FOOTER|NAV|BLOCKQUOTE)$/.test(element.tagName) || !movableComponent(element)) return []
  if (Array.from(element.childNodes).some(node => node.nodeType === Node.TEXT_NODE && node.textContent?.trim())) return []
  const children = Array.from(element.children).filter((child): child is HTMLElement => child instanceof HTMLElement)
  if (children.length < 2 || children.some(child => {
    const css = getComputedStyle(child)
    // Captions can take part in their figure's layout, but never move separately.
    return (!movableComponent(child) && child.tagName !== "FIGCAPTION") || ["absolute", "fixed", "sticky"].includes(css.position)
      || css.transform !== "none" || css.display === "none" || css.order !== "0"
  })) return []
  return children
}

// Utility families are removed at every breakpoint when an explicit layout
// preset replaces them. All unrelated typography, colors, content and IDs stay.
const utility = (value: string) => value.slice(value.lastIndexOf(":") + 1)
export const layoutClass = /^(?:block|inline-block|flow-root|flex|inline-flex|grid|inline-grid|flex-(?:row|col)(?:-reverse)?|flex-wrap(?:-reverse)?|flex-nowrap|grid-(?:cols|rows|flow)-.*|gap(?:-[xy])?-.*|items-.*|justify-.*|space-[xy]-.*)$/
const boxClass = /^(?:-?m[trblxyse]?-.*|(?:min-|max-)?w-.*|float-.*|clear-.*|col-(?:start|end|span)-.*|row-(?:start|end|span)-.*|self-.*|flex-(?:1|auto|initial|none)|basis-.*)$/
export const layoutProperties = ["display", "grid-template-columns", "grid-template-rows", "grid-auto-flow", "flex-direction", "flex-wrap", "gap", "column-gap", "row-gap", "align-items", "justify-content"]
const boxProperties = ["width", "min-width", "max-width", "margin", "margin-left", "margin-right", "margin-top", "margin-bottom", "margin-inline", "margin-block", "float", "clear", "grid-column", "grid-row", "flex", "flex-basis", "align-self"]

export function layoutOperations(editor: EditorApi, doc: EditorDocument) {
  function update(element: HTMLElement, remove: RegExp, add: string[], clear: readonly string[]) {
    const node = doc.nodes[element.dataset.adtId ?? ""]
    if (node?.kind !== "element") return
    // setClasses preserves duplicates, while the Inspector keys rows by class.
    // Repeated presets must not append an existing utility (or retain old copies).
    editor.setClasses(node.id, [...new Set([...node.classes.filter(value => !remove.test(utility(value))), ...add])])
    const style = document.createElement("div").style
    style.cssText = node.attrs.style ?? ""
    for (const property of clear) style.removeProperty(property)
    if (style.cssText !== (node.attrs.style ?? "")) editor.placeNode(node.id, { style: style.cssText || null, coalesce: false })
  }

  function fit(element: HTMLElement) {
    const imageWrapper = element.tagName === "DIV" && element.children.length === 1 && element.firstElementChild?.tagName === "IMG"
    // eslint-disable-next-line lingui/no-unlocalized-strings -- CSS utility pattern
    update(element, imageWrapper ? new RegExp(`${boxClass.source}|^p[trblxy]?-.*$`) : boxClass,
      ["w-full", "min-w-0", "max-w-full"], imageWrapper ? [...boxProperties, "padding", "padding-top", "padding-right", "padding-bottom", "padding-left"] : boxProperties)
  }

  function columns(element: HTMLElement, stacked: boolean) {
    const children = layoutChildren(element)
    if (!children.length) return
    editor.transaction(() => {
      update(element, layoutClass, ["grid", stacked ? "grid-cols-1" : "grid-cols-2", "gap-6", "items-start", ...(!stacked ? ["max-sm:grid-cols-1"] : [])], layoutProperties)
      children.forEach(fit)
    })
  }

  function floatSide(element: HTMLElement, side: "left" | "right") {
    const node = doc.nodes[element.dataset.adtId ?? ""]
    if (node?.kind !== "element") return
    // An explicit float action must be visible at ordinary editor widths. The
    // original max-lg reset otherwise wins even in the Desktop canvas. Keep a
    // full-width stacked layout below sm, including after previous inline edits.
    const edge = side === "right" ? "l" : "r"
    editor.transaction(() => {
      update(element, /^(?:float-.*|clear-.*|(?:min-|max-)?w-.*|-?m[xlrse]?-.*)$/,
        ["w-1/3", "max-w-full", `float-${side}`, `m${edge}-6`, "max-sm:float-none", "max-sm:w-full", `max-sm:m${edge}-0`],
        ["float", "clear", "width", "min-width", "max-width", "margin-inline", "margin-left", "margin-right"])
    })
  }

  function textFlowBox(element: HTMLElement, role: "root" | "wrapper" | "text") {
    if (role === "root") {
      // eslint-disable-next-line lingui/no-unlocalized-strings -- CSS utility pattern
      update(element, new RegExp(`${layoutClass.source}|^flow-root$`), ["flow-root"], layoutProperties)
      return
    }
    // Keep typography and decoration. Replace only the layout constraints that
    // would create separate tracks or prevent lines from wrapping around floats.
    // eslint-disable-next-line lingui/no-unlocalized-strings -- CSS utility pattern
    const remove = new RegExp(`${layoutClass.source}|^flow-root$|^(?:(?:min-|max-)?w-.*|float-.*|clear-.*|col-.*|row-.*|self-.*|justify-self-.*|flex-(?:1|auto|initial|none)|basis-.*)$`)
    const gap = role === "text" && parseFloat(getComputedStyle(element).marginBottom) === 0 ? ["mb-6"] : []
    update(element, remove, ["block", "w-auto", "min-w-0", "max-w-full", ...gap],
      [...layoutProperties, "width", "min-width", "max-width", "float", "clear", "grid-column", "grid-row", "flex", "flex-basis", "align-self", "justify-self"])
  }

  function beside(moving: HTMLElement, target: HTMLElement, before: boolean) {
    const parent = target.parentElement
    const movingId = moving.dataset.adtId, targetId = target.dataset.adtId
    const targetNode = doc.nodes[targetId ?? ""]
    const parentNode = targetNode?.parentId ? doc.nodes[targetNode.parentId] : undefined
    if (!movingId || !targetId || !parent || !flowContainer(parent) || parentNode?.kind !== "element") return false
    if (moving.contains(target) || target.contains(moving)) return false
    let applied = false
    editor.transaction(() => {
      const wrapper = editor.insertNode({ tag: "div", classes: ["grid", "grid-cols-2", "max-sm:grid-cols-1", "gap-6", "items-start", "clear-both", "w-full"] }, { parentId: parentNode.id, index: parentNode.children.indexOf(targetId) })
      if (!wrapper) return
      editor.moveNode(before ? movingId : targetId, { parentId: wrapper, index: 0 })
      editor.moveNode(before ? targetId : movingId, { parentId: wrapper, index: 1 })
      fit(moving); fit(target)
      editor.select(movingId)
      applied = true
    })
    return applied
  }

  return { columns, floatSide, beside, fit, textFlowBox, update }
}
