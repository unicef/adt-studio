import { collectLeafNodes, editLeafText, type PageSectioningOutput as SectioningData } from "@adt/types"

const placeholders = /_{2,}|\[placeholder:[^\]]*\]/g
const blankMarkers = /\[\[blank:([^\]]+)\]\]/g

/** Project native response controls into the sectioning representation. Keep
 * the original printed/named placeholders when their one-to-one association is
 * known. Unknown/new response spaces remain blanks, never learner answers. */
function responseText(element: Element, replacements: Map<string, string>, original?: string): string {
  const parts: Array<string | { key: string }> = []
  let anonymous = 0
  const visit = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? ""
      let offset = 0
      for (const match of text.matchAll(blankMarkers)) {
        parts.push(text.slice(offset, match.index), { key: match[1] })
        offset = match.index! + match[0].length
      }
      parts.push(text.slice(offset))
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const child = node as Element
      if (["STYLE", "SCRIPT"].includes(child.tagName)) return
      if (child.tagName === "TEXTAREA" || (child.tagName === "INPUT" &&
        ["text", "", "number", "search"].includes((child.getAttribute("type") ?? "").toLowerCase()))) {
        parts.push({ key: child.getAttribute("data-activity-item") ?? (child.id || `control-${anonymous++}`) })
      } else {
        child.childNodes.forEach(visit)
      }
    }
  }
  visit(element)
  const keys = parts.flatMap(part => typeof part === "string" ? [] : [part.key])
  if (original !== undefined) {
    const printed = original.match(placeholders) ?? []
    // Order is local to this unchanged leaf, not section ownership. If the
    // source and renderer disagree about the count, do not invent a named answer.
    if (printed.length === keys.length && new Set(keys).size === keys.length) {
      keys.forEach((key, index) => replacements.set(key, printed[index]))
    }
  }
  return parts.map(part => typeof part === "string" ? part : replacements.get(part.key) ?? "______").join("").trim()
}

/**
 * Back-propagate text changes from edited HTML into sectioning data.
 * Compare with the saved rendering, not with sectioning: the renderer may have
 * deliberately represented source blanks as controls or changed formatting.
 */
export function backPropagateTextChanges(
  sectioning: SectioningData,
  sectionIndex: number,
  fullHtml: string,
  savedHtml: string
): SectioningData {
  const parser = new DOMParser()
  const doc = parser.parseFromString(fullHtml, "text/html")
  const saved = parser.parseFromString(savedHtml, "text/html")
  const byId = (document: Document) => new Map([...document.querySelectorAll("[data-id]")]
    .filter(element => element.tagName !== "IMG")
    .map(element => [element.getAttribute("data-id"), element]))
  const before = byId(saved)
  const after = byId(doc)

  const section = sectioning.sections[sectionIndex]
  if (!section) return sectioning

  let nextNodes = section.nodes
  for (const leaf of collectLeafNodes(section.nodes)) {
    if (leaf.role === "image") continue
    const previous = before.get(leaf.nodeId)
    const edited = after.get(leaf.nodeId)
    // New/deleted leaves are handled by structural editing, not guessed from
    // a rendering with no comparable saved element.
    if (!previous || !edited) continue
    const replacements = new Map<string, string>()
    const previousText = responseText(previous, replacements, leaf.text)
    const nextText = responseText(edited, replacements)
    if (nextText !== previousText && nextText !== (leaf.text ?? "")) {
      nextNodes = editLeafText(nextNodes, leaf.nodeId, nextText)
    }
  }
  if (nextNodes === section.nodes) return sectioning
  return { ...sectioning, sections: sectioning.sections.map((value, index) => index === sectionIndex ? { ...value, nodes: nextNodes } : value) }
}

/** Include an explicit tree draft even when the HTML projection adds no text
 * changes. Saving both drafts does not claim that a pending structural edit
 * has already been rendered, and never requests generation. */
export function sectioningSaveFromRendering(
  savedSectioning: SectioningData | null,
  pendingSectioning: SectioningData | null,
  sectionIndex: number,
  editedHtml: string,
  savedHtml: string,
  needsRerender: boolean,
) {
  const base = pendingSectioning ?? savedSectioning
  if (!base) return {}
  const updated = backPropagateTextChanges(base, sectionIndex, editedHtml, savedHtml)
  return pendingSectioning || updated !== base
    ? { sectioning: updated, renderingInSync: !needsRerender }
    : {}
}

