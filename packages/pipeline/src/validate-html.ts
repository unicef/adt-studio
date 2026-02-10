import { parseDocument, DomUtils } from "htmlparser2"

export interface HtmlValidationResult {
  valid: boolean
  errors: string[]
  /** The cleaned HTML (section inner HTML if a <section> tag was found) */
  sectionHtml?: string
}

const EXEMPT_TAGS = new Set(["style", "script"])

/**
 * Find the first <section> element in the parsed document.
 * Returns null if no <section> tag exists.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function findSectionElement(doc: any): any | null {
  return DomUtils.findOne(
    (el) => el.type === "tag" && el.name === "section",
    doc.children ?? [],
    true
  )
}

export function validateSectionHtml(
  html: string,
  allowedTextIds: string[],
  allowedImageIds: string[]
): HtmlValidationResult {
  const allowedIds = new Set([...allowedTextIds, ...allowedImageIds])
  const errors: string[] = []
  const seenIds = new Set<string>()
  const doc = parseDocument(html)

  const section = findSectionElement(doc)
  if (!section) {
    errors.push("No <section> tag found in HTML output")
    return { valid: false, errors }
  }

  walkNode(section, allowedIds, seenIds, errors)

  return {
    valid: errors.length === 0,
    errors,
    sectionHtml: DomUtils.getOuterHTML(section),
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function walkNode(node: any, allowedIds: Set<string>, seenIds: Set<string>, errors: string[]): void {
  if (node.type === "text") {
    if (node.data.trim().length > 0) {
      if (isInsideExemptTag(node)) return
      if (!hasAncestorWithDataId(node)) {
        const snippet = node.data.trim().slice(0, 50)
        errors.push(`Text node outside any data-id element: "${snippet}"`)
      }
    }
    return
  }

  if (node.type === "tag") {
    const dataId = node.attribs?.["data-id"]
    if (dataId !== undefined) {
      if (!allowedIds.has(dataId)) {
        errors.push(`Unknown data-id: "${dataId}"`)
      } else if (seenIds.has(dataId)) {
        errors.push(`Duplicate data-id: "${dataId}"`)
      } else {
        seenIds.add(dataId)
      }
    }
  }

  if (node.children) {
    for (const child of node.children) {
      walkNode(child, allowedIds, seenIds, errors)
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isInsideExemptTag(node: any): boolean {
  let current = node.parent
  while (current) {
    if ((current.type === "tag" || current.type === "style" || current.type === "script") && EXEMPT_TAGS.has(current.name)) {
      return true
    }
    current = current.parent
  }
  return false
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function hasAncestorWithDataId(node: any): boolean {
  let current = node.parent
  while (current) {
    if (current.type === "tag" && current.attribs?.["data-id"] !== undefined) {
      return true
    }
    current = current.parent
  }
  return false
}
