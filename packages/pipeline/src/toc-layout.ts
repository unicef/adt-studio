import type { LeafText } from "./web-rendering.js"
import { DomUtils, parseDocument } from "htmlparser2"

interface TocParts {
  title: string
  leader: string
  separator: string
  pageNumber: string
}

function splitTocEntry(text: string): TocParts | null {
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
  if (!merged || !merged[1].trim()) return null
  return { title: merged[1], leader: "", separator: merged[2], pageNumber: merged[3] }
}

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function addRowClasses(openingTag: string): string {
  const required = "flex items-baseline w-full min-w-0 gap-0"
  if (/\bclass=["']/.test(openingTag)) {
    return openingTag.replace(/\bclass=(["'])/, `class=$1${required} `)
  }
  return openingTag.replace(/>$/, ` class="${required}">`)
}

function rowChildren(parts: TocParts): string {
  const leader = parts.leader
    ? `<span data-toc-leader="true" aria-hidden="true" class="mx-1.5 sm:mx-2 flex-1 min-w-6 border-b-2 border-dotted border-current opacity-80"><span class="sr-only">${escapeHtml(parts.leader)}</span></span>`
    : `<span data-toc-leader="true" aria-hidden="true" class="mx-1.5 sm:mx-2 flex-1 min-w-6 border-b-2 border-dotted border-current opacity-80"></span>`
  const titleText = parts.leader ? parts.title : parts.title + parts.separator
  const pageText = parts.leader
    ? parts.separator + parts.pageNumber
    : parts.pageNumber
  return `<span data-toc-title="true" class="min-w-0 max-w-[82%]">${escapeHtml(titleText)}</span>${leader}<span data-toc-page-number="true" class="w-8 sm:w-10 shrink-0 text-right tabular-nums">${escapeHtml(pageText)}</span>`
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function tocMarkerChildren(element: any): any[] | null {
  const directChildren = (element.children ?? []).filter(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (child: any) => "attribs" in child,
  )
  const markerIndexes = ["data-toc-title", "data-toc-leader", "data-toc-page-number"].map(
    (attribute) => directChildren.findIndex(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (child: any) => child.attribs?.[attribute] === "true",
    ),
  )
  return markerIndexes.every((index) => index >= 0) && markerIndexes.join(",") === "0,1,2"
    ? directChildren.slice(0, 3)
    : null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function hasTocMarkersInOrder(element: any): boolean {
  return tocMarkerChildren(element) !== null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function hasCanonicalTocContent(element: any, parts: TocParts): boolean {
  const markers = tocMarkerChildren(element)
  if (!markers) return false
  const expectedTitle = parts.leader ? parts.title : parts.title + parts.separator
  const expectedPage = parts.leader ? parts.separator + parts.pageNumber : parts.pageNumber
  return (
    DomUtils.textContent(markers[0]) === expectedTitle &&
    DomUtils.textContent(markers[1]) === parts.leader &&
    DomUtils.textContent(markers[2]) === expectedPage
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function addRequiredRowClasses(element: any): void {
  const classes = new Set((element.attribs?.class ?? "").split(/\s+/).filter(Boolean))
  for (const className of ["flex", "items-baseline", "w-full", "min-w-0", "gap-0"]) {
    classes.add(className)
  }
  element.attribs = element.attribs ?? {}
  element.attribs.class = Array.from(classes).join(" ")
}

/** The string fast path intentionally handles the common literal-text shape.
 * When generated HTML already contains child spans, repair only the still-
 * invalid recognized rows through the DOM while preserving their wrapper. */
function repairNestedTableOfContentsRows(html: string, leafTexts: LeafText[]): string {
  const doc = parseDocument(html)
  let changed = false
  for (const leaf of leafTexts) {
    const parts = splitTocEntry(leaf.text)
    if (!parts) continue
    const element = DomUtils.findOne(
      (node) => node.type === "tag" && node.attribs?.["data-id"] === leaf.text_id,
      doc.children,
      true,
    )
    if (!element || hasCanonicalTocContent(element, parts)) continue
    const classes = element.attribs?.class ?? ""
    if (!parts.leader && !/\b(?:flex|grid|items-baseline)\b/.test(classes)) continue

    const fragment = parseDocument(rowChildren(parts))
    for (const child of element.children ?? []) {
      child.parent = null
      child.prev = null
      child.next = null
    }
    for (const child of fragment.children) child.parent = element
    element.children = fragment.children
    addRequiredRowClasses(element)
    changed = true
  }
  return changed ? DomUtils.getOuterHTML(doc) : html
}

/** Guarantee title → dotted leader → right-aligned page-number TOC rows. */
export function repairTableOfContentsLayout(
  html: string,
  leafTexts: LeafText[],
): string {
  let repaired = html
  const expectedPageNumbers = new Set<string>()
  for (const leaf of leafTexts) {
    const parts = splitTocEntry(leaf.text)
    if (!parts) continue
    expectedPageNumbers.add(parts.pageNumber.toLowerCase())
    const id = escapeRegex(leaf.text_id)
    const element = new RegExp(
      `(<([a-z][\\w-]*)\\b[^>]*\\bdata-id=(['"])${id}\\3[^>]*>)([^<>]*)(<\\/\\2>)`,
      "i",
    )
    repaired = repaired.replace(
      element,
      (
        match,
        opening: string,
        _tag: string,
        _quote: string,
        _content: string,
        closing: string,
      ) => {
        // OCR often drops leaders altogether. In that case, only repair elements
        // that the renderer already treated as rows. This prevents a heading such
        // as "Chapter 1" from being mistaken for an entry whose page number is 1.
        if (!parts.leader && !/\b(?:flex|grid|items-baseline)\b/.test(opening)) return match
        return `${addRowClasses(opening)}${rowChildren(parts)}${closing}`
      },
    )
  }

  repaired = repairNestedTableOfContentsRows(repaired, leafTexts)

  // Some generated TOCs add a second, decorative leader immediately after
  // each content leaf. Once the leaf itself owns the complete semantic row,
  // that sibling both doubles the dots and can force long rows past the page.
  repaired = repaired.replace(
    /<span\b([^>]*\b(?:aria-hidden=(?:"true"|'true'))[^>]*)><\/span>/gi,
    (match, attributes: string) =>
      /\bborder-(?:b(?:-\d+)?\s+)?border-dotted\b|\bborder-dotted\b/.test(attributes) &&
      !/\bopacity-80\b/.test(attributes)
        ? ""
        : match,
  )

  // A second failure mode is an absolutely positioned number-only column,
  // visually duplicating every page number. Remove it only when it contains
  // two or more numbers and every value is a page number already present in
  // the semantic TOC leaves. This leaves unrelated badges/footers untouched.
  repaired = repaired.replace(
    /<div\b([^>]*\bclass=(?:"[^"]*\babsolute\b[^"]*"|'[^']*\babsolute\b[^']*')[^>]*)>\s*((?:<(?:div|span)\b[^>]*>\s*(?:[ivxlcdm]+|\d+)\s*<\/(?:div|span)>\s*){2,})<\/div>/gi,
    (match, _attributes: string, body: string) => {
      const numbers = [...body.matchAll(/>\s*([ivxlcdm]+|\d+)\s*</gi)].map((entry) => entry[1].toLowerCase())
      return numbers.length >= 2 && numbers.every((number) => expectedPageNumbers.has(number)) ? "" : match
    },
  )

  // A long TOC title may be split into multiple OCR leaves. Generators often
  // wrap on mobile but force those fragments onto one desktop line, which
  // pushes the repaired terminal leaf and page number beyond the page edge.
  // TOC rows must be allowed to wrap at every viewport, matching print.
  repaired = repaired.replace(/\s*\bsm:flex-nowrap\b/g, "")
  return repaired
}

/** Confirm that every TOC leaf the deterministic repair recognizes retains the
 * three direct child markers needed by layout and runtime translation. */
export function tableOfContentsLayoutErrors(
  html: string,
  leafTexts: LeafText[],
): string[] {
  const doc = parseDocument(html)
  const errors: string[] = []
  for (const leaf of leafTexts) {
    const parts = splitTocEntry(leaf.text)
    if (!parts) continue
    const element = DomUtils.findOne(
      (node) => node.type === "tag" && node.attribs?.["data-id"] === leaf.text_id,
      doc.children,
      true,
    )
    if (!element) continue
    const classes = element.attribs?.class ?? ""
    if (!parts.leader && !/\b(?:flex|grid|items-baseline)\b/.test(classes)) continue
    if (!hasTocMarkersInOrder(element)) {
      errors.push(
        `TOC entry data-id="${leaf.text_id}" must contain direct title, leader, and page-number spans in that order.`,
      )
    }
  }
  return errors
}
