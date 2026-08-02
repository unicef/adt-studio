import { parseDocument, DomUtils } from "htmlparser2"

// htmlparser2/domhandler node construction is loose enough here that a small
// local shape is simpler than pulling in more types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Node = any

const NUMBER_MARKER_RE = /^\((?:[ivxlcdm]+|\d+)\)$/iu
const EXAMPLE_LABEL_RE = /^mfano:?$/iu
const WORD_RE = /\p{L}[\p{L}\p{M}'’‘-]*/gu
const OPTION_CLASS =
  "activity-underline-option inline rounded px-1 cursor-pointer transition-colors underline-offset-4 decoration-2"

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
      class: OPTION_CLASS,
      "data-activity-item": `item-${itemIndex}`,
      "data-question-group": questionGroup,
    },
    children: [],
    parent,
  }
  node.children = [textNode(text, node)]
  return node
}

/**
 * Words that must stay plain text even when everything around them becomes
 * selectable: number markers like "(i)"/"(12)" (matched with their enclosing
 * parens in the surrounding text) and example labels like "Mfano:".
 */
function shouldSkipWord(word: string, source: string, start: number, end: number): boolean {
  if (EXAMPLE_LABEL_RE.test(word)) return true
  if (source[start - 1] === "(" && source[end] === ")") return true
  return false
}

/**
 * Split a text run into option nodes (one per word) and plain-text nodes for
 * whitespace, punctuation, and skipped words. Returns the rebuilt node list
 * and the next unused item index.
 */
function tokenizeTextData(
  original: string,
  parent: Node,
  questionGroup: string,
  itemStart: number,
): { nodes: Node[]; next: number } {
  const nodes: Node[] = []
  let lastIndex = 0
  let itemIndex = itemStart
  WORD_RE.lastIndex = 0

  for (const match of original.matchAll(WORD_RE)) {
    const [word] = match
    const start = match.index ?? 0
    const end = start + word.length
    if (shouldSkipWord(word, original, start, end)) continue
    if (start > lastIndex) {
      nodes.push(textNode(original.slice(lastIndex, start), parent))
    }
    nodes.push(optionNode(word, itemIndex, questionGroup, parent))
    itemIndex += 1
    lastIndex = end
  }

  if (lastIndex < original.length) {
    nodes.push(textNode(original.slice(lastIndex), parent))
  }

  return { nodes, next: itemIndex }
}

function wrapWordsAsOptions(node: Node, itemStart: number, questionGroup: string): number {
  const { nodes, next } = tokenizeTextData(
    DomUtils.textContent(node),
    node,
    questionGroup,
    itemStart,
  )
  node.children = nodes
  return next
}

// ---------------------------------------------------------------------------
// Word-level group completion (sections that already have SOME options)
// ---------------------------------------------------------------------------
//
// The render prompt asks for every word of a word-level question to be
// selectable, but LLMs tend to curate a plausible-candidate subset instead.
// These helpers deterministically finish the job: for every question group
// whose existing options are all single words (the signal that the intended
// answer unit is a word — phrase/sentence groups are left untouched), the
// remaining plain-text words inside that group's wrapper are wrapped as
// additional options of the same group. They are exported because the
// structure validator applies the same scoping to report unwrapped words
// back into the LLM retry loop.

export interface UnderlineGroupNodes {
  /** `data-question-group` value; empty string when the attribute is missing. */
  key: string
  /** Option elements of this group, in document order (htmlparser2 nodes). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  options: any[]
}

function isOptionElement(el: Node): boolean {
  return isTag(el) && hasClass(el, "activity-underline-option")
}

export function collectUnderlineGroups(section: Node): UnderlineGroupNodes[] {
  const byKey = new Map<string, Node[]>()
  const options = DomUtils.findAll(
    (el) => isOptionElement(el),
    section.children ?? [],
  )
  for (const option of options) {
    const key = option.attribs?.["data-question-group"] ?? ""
    const list = byKey.get(key) ?? []
    list.push(option)
    byKey.set(key, list)
  }
  return Array.from(byKey.entries()).map(([key, opts]) => ({ key, options: opts }))
}

/** A group is word-level when every existing option is a single word. */
export function isWordLevelGroup(options: Node[]): boolean {
  if (options.length === 0) return false
  return options.every((opt) => {
    const text = DomUtils.textContent(opt).trim()
    return text.length > 0 && !/\s/.test(text)
  })
}

function containsNode(ancestor: Node, node: Node): boolean {
  let current: Node | null = node
  while (current) {
    if (current === ancestor) return true
    current = current.parent
  }
  return false
}

/**
 * Smallest ancestor below the section containing every option of a group —
 * the sentence wrapper the question lives in. Returns null when only the
 * section itself contains them all (options scattered across wrappers), in
 * which case completion is unsafe: tokenizing at section level would make
 * headings and instructions clickable.
 */
export function findGroupCommonContainer(section: Node, options: Node[]): Node | null {
  if (options.length === 0) return null
  let candidate: Node | null = options[0].parent
  while (candidate && candidate !== section) {
    if (options.every((opt) => containsNode(candidate, opt))) return candidate
    candidate = candidate.parent
  }
  return null
}

/**
 * True when every option under `container` belongs to `groupKey`. A container
 * shared with another question's options means completion would tokenize the
 * other question's words into this group — malformed structure the validator
 * reports instead.
 */
export function containerExclusiveToGroup(container: Node, groupKey: string): boolean {
  const options = DomUtils.findAll(
    (el) => isOptionElement(el),
    container.children ?? [],
  )
  return options.every(
    (opt) => (opt.attribs?.["data-question-group"] ?? "") === groupKey,
  )
}

/**
 * Words inside `container` that are NOT wrapped in an option (skipping number
 * markers and example labels). Empty for a fully tokenized question.
 */
export function findUnwrappedWords(container: Node): string[] {
  const words: string[] = []
  const walk = (node: Node): void => {
    for (const child of node.children ?? []) {
      if (child.type === "text") {
        const data: string = child.data ?? ""
        WORD_RE.lastIndex = 0
        for (const match of data.matchAll(WORD_RE)) {
          const [word] = match
          const start = match.index ?? 0
          if (shouldSkipWord(word, data, start, start + word.length)) continue
          words.push(word)
        }
      } else if (isTag(child) && !isOptionElement(child)) {
        walk(child)
      }
    }
  }
  walk(container)
  return words
}

/** Wrap remaining plain-text words under `node` as options of `questionGroup`. */
function completeContainer(node: Node, questionGroup: string, itemStart: number): number {
  let itemIndex = itemStart
  const nextChildren: Node[] = []
  for (const child of node.children ?? []) {
    if (child.type === "text") {
      const res = tokenizeTextData(child.data ?? "", node, questionGroup, itemIndex)
      itemIndex = res.next
      nextChildren.push(...res.nodes)
    } else {
      if (isTag(child) && !isOptionElement(child)) {
        itemIndex = completeContainer(child, questionGroup, itemIndex)
      }
      nextChildren.push(child)
    }
  }
  node.children = nextChildren
  return itemIndex
}

function maxItemIndex(section: Node): number {
  let max = 0
  const withItem = DomUtils.findAll(
    (el) => isTag(el) && typeof el.attribs?.["data-activity-item"] === "string",
    section.children ?? [],
  )
  for (const el of withItem) {
    const match = /^item-(\d+)$/.exec(el.attribs["data-activity-item"])
    if (match) max = Math.max(max, Number(match[1]))
  }
  return max
}

function completeWordLevelGroups(section: Node): boolean {
  let nextItem = maxItemIndex(section) + 1
  let changed = false
  for (const group of collectUnderlineGroups(section)) {
    if (!group.key) continue // missing data-question-group — validator reports it
    if (!isWordLevelGroup(group.options)) continue
    const container = findGroupCommonContainer(section, group.options)
    // Scattered or shared-wrapper groups — validator reports them
    if (!container || !containerExclusiveToGroup(container, group.key)) continue
    const before = nextItem
    nextItem = completeContainer(container, group.key, nextItem)
    if (nextItem !== before) changed = true
  }
  return changed
}

export function autoRepairUnderlineActivityHtml(html: string, sectionType: string): string {
  if (sectionType !== "activity_underline_text") return html

  const doc = parseDocument(html)
  const section = findSection(doc)
  if (!section) return html

  // Sections that already have options: deterministically finish word-level
  // groups so EVERY word of those sentences is selectable, not just the
  // LLM's curated candidates.
  if (hasUnderlineOptions(section)) {
    return completeWordLevelGroups(section) ? DomUtils.getOuterHTML(doc) : html
  }

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
