import type { LeafText } from "./web-rendering.js"
import { DomUtils, parseDocument } from "htmlparser2"

// htmlparser2 does not expose a convenient common element type through its
// public helpers. Keep the untyped boundary here instead of throughout the
// rendering code.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type HtmlNode = any

interface TocParts {
  title: string
  leader: string
  separator: string
  pageNumber: string
}

interface SplitRow {
  row: HtmlNode
  titles: HtmlNode[]
  pageNumber: HtmlNode
  leader: HtmlNode | null
}

const PAGE_NUMBER_RE = /^\s*(?:[ivxlcdm]+|\d+)\s*$/i
const DOT_RUN_RE = /^\s*\.(?:\s*\.)+\s*$/
const ROW_CLASSES = ["flex", "items-baseline", "w-full", "min-w-0", "gap-0"]
const LEADER_CLASS =
  "mx-1.5 sm:mx-2 flex-1 min-w-6 border-b-2 border-dotted border-current opacity-80"
const PAGE_CLASSES = ["shrink-0", "text-right", "tabular-nums"]

function splitEntry(text: string): TocParts | null {
  const dotted = text.match(/^(.*?)(\.(?:\s*\.)+)(\s*)([ivxlcdm]+|\d+)\s*$/i)
  if (dotted) {
    return {
      title: dotted[1],
      leader: dotted[2],
      separator: dotted[3],
      pageNumber: dotted[4],
    }
  }
  const merged = text.match(/^(.*?\D)(\s*)([ivxlcdm]+|\d+)\s*$/i)
  if (!merged?.[1].trim()) return null
  return { title: merged[1], leader: "", separator: merged[2], pageNumber: merged[3] }
}

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
}

function elements(nodes: HtmlNode[]): HtmlNode[] {
  return DomUtils.findAll((node) => node.type === "tag", nodes)
}

function directElements(element: HtmlNode): HtmlNode[] {
  return (element.children ?? []).filter((child: HtmlNode) => child.type === "tag")
}

function setChildren(parent: HtmlNode, children: HtmlNode[]): void {
  for (const child of parent.children ?? []) {
    child.parent = null
    child.prev = null
    child.next = null
  }
  children.forEach((child, index) => {
    child.parent = parent
    child.prev = children[index - 1] ?? null
    child.next = children[index + 1] ?? null
  })
  parent.children = children
}

function removeNode(node: HtmlNode): void {
  if (node.parent) setChildren(node.parent, node.parent.children.filter((child: HtmlNode) => child !== node))
}

function normalizeLeaf(element: HtmlNode, required: string[], kind: "title" | "page"): void {
  const classes = (element.attribs?.class ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .filter((className: string) => {
      const utility = baseUtility(className)
      if (required.includes(className)) return false
      if (/^(?:absolute|fixed)$/.test(utility)) return false
      if (/^(?:flex(?:-.+)?|grow(?:-.+)?|shrink(?:-.+)?|basis-.+|w-.+|min-w-.+|max-w-.+)$/.test(utility)) {
        return false
      }
      if (kind === "title" && /^(?:truncate|whitespace-nowrap)$/.test(utility)) return false
      if (kind === "page" && /^text-(?:left|center|justify|start|end)$/.test(utility)) return false
      return true
    })
  element.attribs = element.attribs ?? {}
  element.attribs.class = [...new Set([...classes, ...required])].join(" ")
}

function baseUtility(className: string): string {
  return className.slice(className.lastIndexOf(":") + 1)
}

function normalizeRow(row: HtmlNode): void {
  const kept = (row.attribs?.class ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .map((className: string) => {
      const utility = baseUtility(className)
      const indent = utility.match(/^(ml|ms)-(?!auto$)(.+)$/)
      if (!indent) return className
      const prefix = className.slice(0, className.length - utility.length)
      return `${prefix}${indent[1] === "ml" ? "pl" : "ps"}-${indent[2]}`
    })
    .filter((className: string) => {
      const utility = baseUtility(className)
      return !(
        /^(?:flex|inline-flex|grid|inline-grid|flex-nowrap)$/.test(utility) ||
        /^(?:w|min-w|max-w)-/.test(utility) ||
        /^(?:grid-cols|gap(?:-[xy])?|items|space-x)-/.test(utility)
      )
    })
  row.attribs = row.attribs ?? {}
  row.attribs.class = [...new Set([...kept, ...ROW_CLASSES])].join(" ")
}

function rowMarkup(parts: TocParts): string {
  const title = parts.leader ? parts.title : parts.title + parts.separator
  const page = parts.leader ? parts.separator + parts.pageNumber : parts.pageNumber
  const sourceDots = parts.leader
    ? `<span class="sr-only">${escapeHtml(parts.leader)}</span>`
    : ""
  return `<span data-toc-title="true" class="min-w-0 max-w-[82%]">${escapeHtml(title)}</span><span data-toc-leader="true" aria-hidden="true" class="${LEADER_CLASS}">${sourceDots}</span><span data-toc-page-number="true" class="w-8 sm:w-10 ${PAGE_CLASSES.join(" ")}">${escapeHtml(page)}</span>`
}

function replaceMergedRow(row: HtmlNode, parts: TocParts): void {
  setChildren(row, parseDocument(rowMarkup(parts)).children)
  normalizeRow(row)
}

function isLeader(element: HtmlNode): boolean {
  if (element.type !== "tag" || element.attribs?.["data-id"]) return false
  if (element.attribs?.["data-toc-leader"] === "true") return true
  return (
    DOT_RUN_RE.test(DomUtils.textContent(element)) ||
    (element.attribs?.["aria-hidden"] === "true" &&
      /\bborder-dotted\b/.test(element.attribs?.class ?? ""))
  )
}

function createLeader(): HtmlNode {
  const leader = parseDocument("<span></span>").children[0]
  if (!leader) throw new Error("Failed to create TOC leader")
  return leader
}

function findSplitRows(doc: HtmlNode, leafById: Map<string, string>): SplitRow[] {
  const rows: SplitRow[] = []
  for (const row of elements(doc.children)) {
    if (row.attribs?.["data-id"] || /^h[1-6]$/i.test(row.name ?? "")) continue
    const children = directElements(row)
    const leaves = children.filter((child) => leafById.has(child.attribs?.["data-id"]))
    const pageNumber = leaves.at(-1)
    const pageText = pageNumber && leafById.get(pageNumber.attribs["data-id"])
    if (!pageNumber || !pageText || !PAGE_NUMBER_RE.test(pageText)) continue

    const pageIndex = children.indexOf(pageNumber)
    const titles = leaves.filter((child) => {
      const text = leafById.get(child.attribs["data-id"]) ?? ""
      return children.indexOf(child) < pageIndex && text.trim() && !PAGE_NUMBER_RE.test(text)
    })
    const leader = children.find(isLeader) ?? null
    const rowLike = /\b(?:flex|grid|items-baseline)\b/.test(row.attribs?.class ?? "")
    if (titles.length && (leader || rowLike || leaves.length === 2)) {
      rows.push({ row, titles, pageNumber, leader })
    }
  }
  return rows
}

function normalizeSplitRow(split: SplitRow): void {
  const leader = split.leader ?? createLeader()
  leader.attribs = {
    ...leader.attribs,
    "data-toc-leader": "true",
    "aria-hidden": "true",
    class: LEADER_CLASS,
  }
  setChildren(leader, [])

  const children = split.row.children.filter(
    (child: HtmlNode) =>
      !isLeader(child) &&
      !(child.type === "text" && DOT_RUN_RE.test(child.data ?? "")),
  )
  children.splice(children.indexOf(split.pageNumber), 0, leader)
  setChildren(split.row, children)
  normalizeRow(split.row)
  for (const title of split.titles) normalizeLeaf(title, ["min-w-0"], "title")
  normalizeLeaf(split.pageNumber, PAGE_CLASSES, "page")
}

function removeDuplicateDecorations(doc: HtmlNode, pageNumbers: Set<string>): boolean {
  let changed = false
  for (const element of elements(doc.children)) {
    if (element.attribs?.["data-toc-leader"] !== "true" && isLeader(element)) {
      const ownsRow = element.parent && directElements(element.parent).some(
        (sibling) => directElements(sibling).some(
          (child) => child.attribs?.["data-toc-leader"] === "true",
        ),
      )
      if (ownsRow) {
        removeNode(element)
        changed = true
      }
    }

    const classes = (element.attribs?.class ?? "").split(/\s+/)
    if (classes.includes("sm:flex-nowrap")) {
      element.attribs.class = classes.filter((name: string) => name !== "sm:flex-nowrap").join(" ")
      changed = true
    }

    if (classes.includes("absolute")) {
      const values = directElements(element).map((child) => DomUtils.textContent(child).trim())
      if (
        values.length >= 2 &&
        values.every((value) => PAGE_NUMBER_RE.test(value) && pageNumbers.has(value.toLowerCase()))
      ) {
        removeNode(element)
        changed = true
      }
    }
  }
  return changed
}

/** Normalize the two TOC shapes produced by extraction: one merged text leaf,
 * or separate title and page-number leaves in the same row. */
export function repairTableOfContentsLayout(html: string, leafTexts: LeafText[]): string {
  const doc = parseDocument(html)
  const leafById = new Map(leafTexts.map((leaf) => [leaf.text_id, leaf.text]))
  const elementById = new Map(
    elements(doc.children)
      .filter((element) => element.attribs?.["data-id"])
      .map((element) => [element.attribs["data-id"], element]),
  )
  const pageNumbers = new Set<string>()
  let changed = false

  for (const leaf of leafTexts) {
    const parts = splitEntry(leaf.text)
    if (!parts) {
      if (PAGE_NUMBER_RE.test(leaf.text)) pageNumbers.add(leaf.text.trim().toLowerCase())
      continue
    }
    pageNumbers.add(parts.pageNumber.toLowerCase())
    const row = elementById.get(leaf.text_id)
    if (!row) continue
    const rowLike = /\b(?:flex|grid|items-baseline)\b/.test(row.attribs?.class ?? "")
    if (!parts.leader && !rowLike) continue
    replaceMergedRow(row, parts)
    changed = true
  }

  for (const split of findSplitRows(doc, leafById)) {
    normalizeSplitRow(split)
    changed = true
  }

  changed = removeDuplicateDecorations(doc, pageNumbers) || changed
  return changed ? DomUtils.getOuterHTML(doc) : html
}

/** Rendering calls repair first, so a second pass must be a no-op. */
export function tableOfContentsLayoutErrors(html: string, leafTexts: LeafText[]): string[] {
  return repairTableOfContentsLayout(html, leafTexts) === html
    ? []
    : ["Table-of-contents rows must use the canonical title, leader, and page-number layout."]
}
