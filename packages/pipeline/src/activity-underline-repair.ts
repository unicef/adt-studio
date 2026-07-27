import { parseDocument, DomUtils } from "htmlparser2"

// htmlparser2/domhandler node construction is loose enough here that a small
// local shape is simpler than pulling in more types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Node = any

const NUMBER_MARKER_RE = /^\((?:[ivxlcdm]+|\d+)\)$/iu
const EXAMPLE_LABEL_RE = /^mfano:?$/iu
const WORD_RE = /\p{L}[\p{L}\p{M}'’‘-]*/gu

function isTag(node: Node, name?: string): boolean {
  if (node?.type !== "tag") return false
  if (!name) return true
  return (node.name ?? "").toLowerCase() === name.toLowerCase()
}

function hasClass(node: Node, className: string): boolean {
  const raw = node?.attribs?.class
  if (typeof raw !== "string" || raw.length === 0) return false
  return raw.split(/\s+/).includes(className)
}

function findSection(doc: Node): Node | null {
  return DomUtils.findOne(
    (el) => isTag(el, "section"),
    doc.children ?? [],
    true,
  )
}

function findDataIdElements(root: Node): Node[] {
  return DomUtils.findAll(
    (el) => isTag(el) && typeof el.attribs?.["data-id"] === "string",
    root.children ?? [],
  )
}

function hasUnderlineOptions(root: Node): boolean {
  return (
    DomUtils.findOne(
    (el) => isTag(el) && hasClass(el, "activity-underline-option"),
    root.children ?? [],
    true,
    )
    !== null
  )
}

function hasNestedTags(node: Node): boolean {
  return (node.children ?? []).some((child: Node) => child.type === "tag")
}

function hasNestedDataId(node: Node): boolean {
  return DomUtils.findOne(
    (el) =>
      el !== node &&
      isTag(el) &&
      typeof el.attribs?.["data-id"] === "string",
    node.children ?? [],
    true,
  ) !== null
}

function looksLikeInteractiveSentence(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed) return false
  if (EXAMPLE_LABEL_RE.test(trimmed)) return false
  if (NUMBER_MARKER_RE.test(trimmed)) return false
  if (trimmed.endsWith(":")) return false
  if (!/[.!?]$/.test(trimmed)) return false
  if (!/\s/.test(trimmed)) return false
  if (!/\p{L}/u.test(trimmed)) return false
  return true
}

function textNode(data: string, parent: Node): Node {
  return {
    type: "text",
    data,
    parent,
  }
}

function optionNode(
  text: string,
  itemIndex: number,
  questionGroup: string,
  parent: Node,
): Node {
  const node: Node = {
    type: "tag",
    name: "span",
    attribs: {
      class:
        "activity-underline-option inline rounded px-1 cursor-pointer transition-colors underline-offset-4 decoration-2",
      "data-activity-item": `item-${itemIndex}`,
      "data-question-group": questionGroup,
    },
    children: [],
    parent,
  }
  node.children = [textNode(text, node)]
  return node
}

function wrapWordsAsOptions(node: Node, itemStart: number, questionGroup: string): number {
  const original = DomUtils.textContent(node)
  const nextChildren: Node[] = []
  let lastIndex = 0
  let itemIndex = itemStart
  WORD_RE.lastIndex = 0

  for (const match of original.matchAll(WORD_RE)) {
    const [word] = match
    const start = match.index ?? 0
    if (start > lastIndex) {
      nextChildren.push(textNode(original.slice(lastIndex, start), node))
    }
    nextChildren.push(optionNode(word, itemIndex, questionGroup, node))
    itemIndex += 1
    lastIndex = start + word.length
  }

  if (lastIndex < original.length) {
    nextChildren.push(textNode(original.slice(lastIndex), node))
  }

  node.children = nextChildren
  return itemIndex
}

export function autoRepairUnderlineActivityHtml(html: string, sectionType: string): string {
  if (sectionType !== "activity_underline_text") return html

  const doc = parseDocument(html)
  const section = findSection(doc)
  if (!section) return html
  if (hasUnderlineOptions(section)) return html

  const dataIdElements = findDataIdElements(section)
  let inWorkedExample = false
  let questionIndex = 1
  let itemIndex = 1

  for (const el of dataIdElements) {
    const text = DomUtils.textContent(el).trim()

    if (hasNestedDataId(el)) continue

    if (!text) continue

    if (EXAMPLE_LABEL_RE.test(text)) {
      inWorkedExample = true
      continue
    }

    if (NUMBER_MARKER_RE.test(text)) {
      inWorkedExample = false
      continue
    }

    if (inWorkedExample) continue
    if (!looksLikeInteractiveSentence(text)) continue

    itemIndex = wrapWordsAsOptions(el, itemIndex, `question-group-${questionIndex}`)
    questionIndex += 1
  }

  return DomUtils.getOuterHTML(doc)
}
