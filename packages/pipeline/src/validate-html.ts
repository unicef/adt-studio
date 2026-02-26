import { parseDocument, DomUtils } from "htmlparser2"

/** Minimum similarity (0–1) for auto-fixing text vs treating as a validation error */
const TEXT_SIMILARITY_THRESHOLD = 0.9

export interface HtmlValidationResult {
  valid: boolean
  errors: string[]
  /** The cleaned HTML — includes <div id="content"> wrapper when present, otherwise just the <section> */
  sectionHtml?: string
}

const EXEMPT_TAGS = new Set(["style", "script"])
const DISALLOWED_TAGS = new Set(["script", "iframe", "object", "embed"])
const URL_ATTRS = new Set(["src", "href", "xlink:href", "formaction"])

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function findSectionElements(doc: any): any[] {
  return DomUtils.findAll(
    (el) => el.type === "tag" && el.name === "section",
    doc.children ?? []
  )
}

/**
 * Find the <div id="content"> container in the parsed document.
 * Returns null if no such element exists.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function findContentContainer(doc: any): any | null {
  return DomUtils.findOne(
    (el) => el.type === "tag" && el.name === "div" && el.attribs?.id === "content",
    doc.children ?? [],
    true
  )
}

export interface HtmlValidationOptions {
  /** When true, data-ids prefixed with "activity_gen_" are allowed even if not in the allowed set */
  allowActivityGeneratedIds?: boolean
  /** Map of text data-id → expected text content. Validates rendered text matches the source. */
  expectedTexts?: Map<string, string>
  /** Expected value for the section's data-section-type attribute. */
  expectedSectionType?: string
  /** Expected value for the section's data-section-id attribute. */
  expectedSectionId?: string
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

  const sections = findSectionElements(doc)
  if (sections.length === 0) {
    errors.push("No <section> tag found in HTML output")
    return { valid: false, errors }
  }
  if (sections.length > 1) {
    errors.push(`Expected exactly one <section> tag, found ${sections.length}`)
  }

  const section = sections[0]
  validateRequiredSectionAttributes(section, options, errors)

  walkNode(section, allowedIds, imageIdSet, errors, options)

  if (imageUrlPrefix) {
    rewriteImageSrcs(section, imageIdSet, imageUrlPrefix)
  }

  // Prefer the <div id="content"> wrapper when present so background colors
  // and other container-level styling are preserved in the stored HTML.
  const contentContainer = findContentContainer(doc)
  const outputNode = contentContainer ?? section

  return {
    valid: errors.length === 0,
    errors,
    sectionHtml: DomUtils.getOuterHTML(outputNode),
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function validateRequiredSectionAttributes(
  section: any,
  options: HtmlValidationOptions | undefined,
  errors: string[]
): void {
  if (!options) return

  const actualSectionType = section.attribs?.["data-section-type"]
  const actualSectionId = section.attribs?.["data-section-id"]

  if (options.expectedSectionType !== undefined) {
    if (actualSectionType === undefined) {
      errors.push('Missing required section attribute "data-section-type"')
    } else if (actualSectionType !== options.expectedSectionType) {
      errors.push(
        `Invalid data-section-type: expected "${options.expectedSectionType}" but got "${actualSectionType}"`
      )
    }
  }

  if (options.expectedSectionId !== undefined) {
    if (actualSectionId === undefined) {
      errors.push('Missing required section attribute "data-section-id"')
    } else if (actualSectionId !== options.expectedSectionId) {
      errors.push(
        `Invalid data-section-id: expected "${options.expectedSectionId}" but got "${actualSectionId}"`
      )
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function walkNode(
  node: any,
  allowedIds: Set<string>,
  imageIds: Set<string>,
  errors: string[],
  options?: HtmlValidationOptions
): void {
  let replacementText: string | undefined

  if (node.type === "text") {
    if (node.data.trim().length > 0) {
      if (isInsideExemptTag(node)) return
      // Allow single-digit numbers as bare text (used as option markers in activities)
      if (/^\d$/.test(node.data.trim())) return
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
    if (tagName === "img") {
      if (dataId === undefined) {
        errors.push('<img> tag missing required "data-id" attribute')
      } else if (!imageIds.has(dataId)) {
        errors.push(`Invalid image data-id: "${dataId}"`)
      }
    } else if (dataId !== undefined && tagName !== "section" && imageIds.has(dataId)) {
      errors.push(`Image data-id "${dataId}" must be used on an <img> tag`)
    }

    // Skip data-id validation on <section> elements — their data-id is a
    // section identifier (e.g. "pg028_section"), not a content element ID.
    if (dataId !== undefined && tagName !== "section" && !allowedIds.has(dataId)) {
      if (!(options?.allowActivityGeneratedIds && dataId.startsWith("activity_gen_"))) {
        errors.push(`Unknown data-id: "${dataId}"`)
      }
    }

    // Verify text content matches expected text for this data-id.
    // Always substitute the correct text back in. Only fail validation
    // when the LLM's text is too far from the expected content.
    if (
      dataId !== undefined &&
      options?.expectedTexts?.has(dataId) &&
      !imageIds.has(dataId) &&
      tagName !== "img"
    ) {
      const actualText = normalizeText(DomUtils.getText(node))
      const expectedText = normalizeText(options.expectedTexts.get(dataId)!)
      replacementText = options.expectedTexts.get(dataId)!
      if (actualText !== expectedText) {
        const similarity = textSimilarity(actualText, expectedText)
        if (similarity < TEXT_SIMILARITY_THRESHOLD) {
          errors.push(
            `Text mismatch for data-id "${dataId}": expected "${expectedText.slice(0, 80)}" but got "${actualText.slice(0, 80)}"`
          )
        }
      }
    }
  }

  if (node.children) {
    for (const child of node.children) {
      walkNode(child, allowedIds, imageIds, errors, options)
    }
  }

  if (replacementText !== undefined) {
    replaceChildrenWithText(node, replacementText)
  }
}

/**
 * Rewrite src attributes on elements whose data-id matches an image ID.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rewriteImageSrcs(node: any, imageIds: Set<string>, urlPrefix: string): void {
  if (node.type === "tag" && (node.name ?? "").toLowerCase() === "img") {
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

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim()
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

/**
 * Replace all children of a DOM node with a single text node.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function replaceChildrenWithText(node: any, text: string): void {
  for (const child of node.children) {
    child.parent = null
    child.prev = null
    child.next = null
  }
  const textNode = {
    type: "text" as const,
    data: text,
    parent: node,
    prev: null,
    next: null,
    startIndex: null,
    endIndex: null,
  }
  node.children = [textNode]
}

/**
 * Levenshtein edit distance between two strings.
 * Two-row DP approach — O(min(m,n)) space.
 */
export function levenshteinDistance(a: string, b: string): number {
  if (a.length > b.length) [a, b] = [b, a]
  const m = a.length
  const n = b.length
  let prev = Array.from({ length: m + 1 }, (_, i) => i)
  let curr = new Array<number>(m + 1)

  for (let j = 1; j <= n; j++) {
    curr[0] = j
    for (let i = 1; i <= m; i++) {
      if (a[i - 1] === b[j - 1]) {
        curr[i] = prev[i - 1]
      } else {
        curr[i] = 1 + Math.min(prev[i - 1], prev[i], curr[i - 1])
      }
    }
    ;[prev, curr] = [curr, prev]
  }
  return prev[m]
}

/**
 * Similarity ratio between two strings (0.0 – 1.0).
 * 1.0 = identical, 0.0 = completely different.
 */
export function textSimilarity(a: string, b: string): number {
  if (a === b) return 1.0
  const maxLen = Math.max(a.length, b.length)
  if (maxLen === 0) return 1.0
  return 1 - levenshteinDistance(a, b) / maxLen
}
