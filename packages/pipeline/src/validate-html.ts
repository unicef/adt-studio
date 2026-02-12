import { parseDocument, DomUtils } from "htmlparser2"

export interface HtmlValidationResult {
  valid: boolean
  errors: string[]
  /** The cleaned HTML (section inner HTML if a <section> tag was found) */
  sectionHtml?: string
}

const EXEMPT_TAGS = new Set(["style", "script"])
const DISALLOWED_TAGS = new Set(["script", "iframe", "object", "embed"])
const URL_ATTRS = new Set(["src", "href", "xlink:href", "formaction"])

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

export interface HtmlValidationOptions {
  /** When true, data-ids prefixed with "activity_gen_" are allowed even if not in the allowed set */
  allowActivityGeneratedIds?: boolean
}

export function validateSectionHtml(
  html: string,
  allowedTextIds: string[],
  allowedImageIds: string[],
  imageUrlPrefix?: string,
  options?: HtmlValidationOptions
): HtmlValidationResult {
  const allowedIds = new Set([...allowedTextIds, ...allowedImageIds])
  const imageIdSet = new Set(allowedImageIds)
  const errors: string[] = []
  const doc = parseDocument(html)

  const section = findSectionElement(doc)
  if (!section) {
    errors.push("No <section> tag found in HTML output")
    return { valid: false, errors }
  }

  walkNode(section, allowedIds, errors, options)

  if (imageUrlPrefix) {
    rewriteImageSrcs(section, imageIdSet, imageUrlPrefix)
  }

  return {
    valid: errors.length === 0,
    errors,
    sectionHtml: DomUtils.getOuterHTML(section),
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function walkNode(node: any, allowedIds: Set<string>, errors: string[], options?: HtmlValidationOptions): void {
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

  if (
    node.type === "tag" ||
    node.type === "script" ||
    node.type === "style"
  ) {
    const tagName = (node.name ?? node.type ?? "").toLowerCase()
    if (DISALLOWED_TAGS.has(tagName)) {
      errors.push(`Disallowed tag: <${tagName}>`)
    }

    const attribs = node.attribs ?? {}
    for (const [name, value] of Object.entries(attribs) as Array<[string, string]>) {
      const attr = name.toLowerCase()
      if (attr.startsWith("on")) {
        errors.push(`Event handler attribute not allowed: "${name}"`)
      }
      if (URL_ATTRS.has(attr) && isUnsafeUrl(value)) {
        errors.push(`Unsafe URL in attribute "${name}"`)
      }
      if (attr === "style" && hasUnsafeCss(value)) {
        errors.push("Unsafe CSS in style attribute")
      }
    }

    const dataId = node.attribs?.["data-id"]
    if (dataId !== undefined && !allowedIds.has(dataId)) {
      if (!(options?.allowActivityGeneratedIds && dataId.startsWith("activity_gen_"))) {
        errors.push(`Unknown data-id: "${dataId}"`)
      }
    }
  }

  if (node.children) {
    for (const child of node.children) {
      walkNode(child, allowedIds, errors, options)
    }
  }
}

/**
 * Rewrite src attributes on elements whose data-id matches an image ID.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rewriteImageSrcs(node: any, imageIds: Set<string>, urlPrefix: string): void {
  if (node.type === "tag") {
    const dataId = node.attribs?.["data-id"]
    if (dataId !== undefined && imageIds.has(dataId)) {
      node.attribs.src = `${urlPrefix}/${dataId}`
    }
  }
  if (node.children) {
    for (const child of node.children) {
      rewriteImageSrcs(child, imageIds, urlPrefix)
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isInsideExemptTag(node: any): boolean {
  let current = node.parent
  while (current) {
    if (current.type === "style" && EXEMPT_TAGS.has("style")) {
      return true
    }
    if (current.type === "script" && EXEMPT_TAGS.has("script")) {
      return true
    }
    if (
      current.type === "tag" &&
      EXEMPT_TAGS.has((current.name ?? "").toLowerCase())
    ) {
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

function isUnsafeUrl(value: string): boolean {
  const normalized = value.trim().toLowerCase()
  return (
    normalized.startsWith("javascript:") ||
    normalized.startsWith("vbscript:") ||
    normalized.startsWith("data:text/html")
  )
}

function hasUnsafeCss(value: string): boolean {
  const normalized = value.toLowerCase()
  return (
    normalized.includes("expression(") ||
    normalized.includes("url(javascript:") ||
    normalized.includes("url(vbscript:")
  )
}
