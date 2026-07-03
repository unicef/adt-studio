import { parseDocument, DomUtils } from "htmlparser2"
import { normalizeSectionSemantics } from "./html-semantics.js"
import { validateActivityStructure } from "./validate-activity-structure.js"

/** Minimum similarity (0–1) for auto-fixing text vs treating as a validation error */
const TEXT_SIMILARITY_THRESHOLD = 0.7

export interface HtmlValidationResult {
  valid: boolean
  errors: string[]
  /** The cleaned HTML — includes <div id="content"> wrapper when present, otherwise just the <section> */
  sectionHtml?: string
}

const EXEMPT_TAGS = new Set(["style", "script"])
/** Matches fill-in-the-blank inline markers like [[blank:item-1]] or [[blank:item-1:hint]] */
const BLANK_MARKER_RE = /\[\[blank:item-\d+(?::[^\]]+)?\]\]/g
/** Non-global version for .test() checks (avoids stateful lastIndex issues) */
const BLANK_MARKER_TEST_RE = /\[\[blank:item-\d+(?::[^\]]+)?\]\]/
/** Section types whose rendered HTML must contain at least one editable element. */
const WRITABLE_SECTION_TYPES = new Set([
  "activity_open_ended_answer",
  "activity_fill_in_the_blank",
  "activity_fill_in_a_table",
])
/**
 * Input `type` values that are NOT writable (radio/checkbox/submit/etc.).
 * An <input> is only counted as an editable element if its type is absent or
 * is not in this set. A missing type defaults to "text" per the HTML spec.
 */
const NON_WRITABLE_INPUT_TYPES = new Set([
  "radio",
  "checkbox",
  "hidden",
  "submit",
  "button",
  "reset",
  "image",
  "file",
  "range",
  "color",
])
/** Matches placeholder sequences used in textbooks for blanks (3+ underscores or 3+ dots) */
const TEXTBOOK_BLANK_RE = /_{3,}|\.{3,}/g
/** Matches [placeholder:word] markers added during text classification */
const PLACEHOLDER_MARKER_RE = /\[placeholder:[^\]]+\]/g
const DISALLOWED_TAGS = new Set(["script", "iframe", "object", "embed"])
const URL_ATTRS = new Set(["src", "href", "xlink:href", "formaction"])
const NAMED_HTML_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: "\"",
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  hellip: "…",
  bull: "•",
  copy: "©",
}

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
  /**
   * data-ids permitted on wrapper elements that carry nested HTML children.
   * The "string children only" rule (implicit via the expectedTexts check)
   * does NOT apply to these IDs. Used for `group` / `activity` container
   * node_ids. Each must still appear at most once in the document and is
   * not required to be present.
   */
  allowedContainerIds?: string[]
  /**
   * Subset of text data-ids that may legitimately be omitted from the
   * rendered HTML. Used for nodes whose source text carries no content
   * the learner needs to see — e.g. an `activity_fill_in_the_blank`
   * leaf whose entire text is a textbook blank placeholder ("___"),
   * or a `footer` leaf that survived pruning. The LLM is still allowed
   * to include them, but the "Missing required text data-id" check is
   * suppressed if it doesn't.
   */
  optionalTextIds?: Set<string>
}

export function validateSectionHtml(
  html: string,
  allowedTextIds: string[],
  allowedImageIds: string[],
  imageUrlPrefix?: string,
  options?: HtmlValidationOptions
): HtmlValidationResult {
  const containerIds = options?.allowedContainerIds ?? []
  const allowedIds = new Set([...allowedTextIds, ...allowedImageIds, ...containerIds])
  const imageIdSet = new Set(allowedImageIds)
  const errors: string[] = []
  const doc = parseDocument(repairMalformedHtmlEntities(html))

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

  // Sections whose whole purpose is for the learner to write must contain
  // at least one editable element. If the LLM emits only static underlines
  // (decorative borders, <hr>s, runs of underscores), the page looks right
  // but is unusable — fail loudly so the renderer retries.
  const sectionType = section.attribs?.["data-section-type"]
  if (
    typeof sectionType === "string" &&
    WRITABLE_SECTION_TYPES.has(sectionType) &&
    !hasEditableElement(section)
  ) {
    errors.push(
      `Section type "${sectionType}" requires at least one editable element (<textarea>, <input>, or [[blank:item-N]] marker), but none were found. The learner cannot type into this page.`
    )
  }

  // Activity-specific structural checks. These catch failure modes the visual
  // reviewer can't see (missing `.activity-option`, broken true/false pairing,
  // duplicate item ids, etc.) and feed the LLM precise, actionable errors via
  // the visual-review feedback loop.
  if (typeof sectionType === "string") {
    for (const err of validateActivityStructure(section, sectionType)) {
      errors.push(err)
    }
  }

  // Verify all expected text IDs are present in the generated HTML.
  // This ensures the LLM doesn't silently drop entries (e.g. duplicated texts).
  // IDs in `optionalTextIds` may be absent (placeholder-only blanks, leaked
  // footers, etc.) — they're still allowed if the LLM chooses to include them.
  if (allowedTextIds.length > 0) {
    const optional = options?.optionalTextIds
    const renderedDataIds = new Set<string>()
    collectDataIds(section, renderedDataIds)
    for (const textId of allowedTextIds) {
      if (!renderedDataIds.has(textId) && !optional?.has(textId)) {
        errors.push(`Missing required text data-id: "${textId}"`)
      }
    }
  }

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
  normalizeSectionSemantics(section)

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

/**
 * True if the node is a writable input element: a <textarea>, or an <input>
 * whose type is absent or is a text-accepting type (not radio/checkbox/etc.).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isWritableInput(node: any): boolean {
  if (node.type !== "tag") return false
  const tagName = (node.name ?? "").toLowerCase()
  if (tagName === "textarea") return true
  if (tagName !== "input") return false
  const inputType = (node.attribs?.type ?? "text").toLowerCase()
  return !NON_WRITABLE_INPUT_TYPES.has(inputType)
}

/**
 * Walk the subtree and report whether any editable element is present: a
 * writable <input>/<textarea>, or text containing a [[blank:item-N]] marker
 * (which gets hydrated into an <input> at runtime). Skips <script>/<style>
 * subtrees so markers appearing inside them don't falsely satisfy the check.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function hasEditableElement(node: any): boolean {
  // htmlparser2 uses dedicated node types for <script>/<style>; these are
  // never writable and their text content is not rendered as HTML, so any
  // marker inside them must be ignored.
  if (node.type === "script" || node.type === "style") return false
  if (node.type === "tag") {
    const tagName = (node.name ?? "").toLowerCase()
    if (tagName === "script" || tagName === "style") return false
    if (isWritableInput(node)) return true
  }
  if (node.type === "text" && typeof node.data === "string") {
    if (BLANK_MARKER_TEST_RE.test(node.data)) return true
  }
  if (node.children) {
    for (const child of node.children) {
      if (hasEditableElement(child)) return true
    }
  }
  return false
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function hasFitbSentenceClass(node: any): boolean {
  let current = node
  while (current) {
    if (current.type === "tag" && current.attribs?.class) {
      const classes = current.attribs.class.split(/\s+/)
      if (classes.includes("fitb-sentence")) return true
    }
    current = current.parent
  }
  return false
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
      if (hasGeneratedA11yLabelAncestor(node)) return
      if (hasAriaHiddenAncestor(node)) return
      // Screen-reader-only text (Tailwind `sr-only`, or the historical
      // `visually-hidden` class) is invisible to sighted users by design —
      // the LLM uses it for accessible labels on inputs and image controls.
      // Allow such text without a data-id since it can't visually pollute
      // the rendered page and improves a11y when the LLM emits it.
      if (hasSrOnlyAncestor(node)) return
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

      // Check if the element contains [[blank:item-N]] markers (fill-in-the-blank
      // inline blanks). When present, strip them before comparing similarity so we
      // don't flag the blank placeholders as a text mismatch. Also skip the
      // replacement step to preserve the markers in the output HTML.
      const hasBlankMarkers = BLANK_MARKER_TEST_RE.test(actualText)

      if (hasBlankMarkers) {
        // Verify the fitb-sentence class is present on this element or an ancestor,
        // otherwise the runtime JS won't find and hydrate the blank markers.
        if (!hasFitbSentenceClass(node)) {
          errors.push(
            `Element with data-id "${dataId}" contains [[blank:item-N]] markers but is missing the "fitb-sentence" class (required on the element or an ancestor for runtime hydration)`
          )
        }
        // Compare without the blank markers in actual and underscore/dot/placeholder markers in expected.
        // Also strip single `_` chars from the expected so inline letter blanks (e.g. source text `"en_ro"`
        // rendered as `"en[[blank:item-1]]ro"`) match without the underscore throwing off similarity.
        // Strip `[placeholder:...]` markers BEFORE the dot-run regex, otherwise the dot run inside the
        // placeholder (e.g. `[placeholder:..........]`) gets consumed first, leaving `[placeholder:]`
        // (empty contents) which then no longer matches PLACEHOLDER_MARKER_RE.
        const strippedActual = normalizeText(actualText.replace(BLANK_MARKER_RE, ""))
        const strippedExpected = normalizeText(
          expectedText
            .replace(PLACEHOLDER_MARKER_RE, "")
            .replace(TEXTBOOK_BLANK_RE, "")
            .replace(/_/g, "")
        )
        if (strippedActual !== strippedExpected) {
          const similarity = textSimilarity(strippedActual, strippedExpected)
          if (similarity < TEXT_SIMILARITY_THRESHOLD) {
            errors.push(
              `Text mismatch for data-id "${dataId}": expected "${strippedExpected.slice(0, 80)}" but got "${strippedActual.slice(0, 80)}"`
            )
          }
        }
        // Do NOT set replacementText — preserve the blank markers in the HTML
      } else {
        // The LLM is expected to replace textbook-style blank placeholders
        // (___ or ...) with a separate editable element. If the raw expected
        // text contains such a placeholder, we always strip it from the
        // rendered text — never let the underscores/dots appear visibly
        // next to the input, even if the LLM kept them in its output.
        // Compute both full and placeholder-stripped variants; pick the
        // stripped version whenever the expected text has a placeholder,
        // otherwise fall back to whichever is closer to the LLM's output.
        const rawExpected = options.expectedTexts.get(dataId)!
        const strippedRaw = stripBlankPlaceholders(rawExpected)
        const strippedExpected = normalizeText(strippedRaw)
        const hasTextbookPlaceholder =
          /_{3,}|\.{3,}/.test(rawExpected) ||
          /\[placeholder:[^\]]+\]/.test(rawExpected)
        const fullSim = textSimilarity(actualText, expectedText)
        const strippedSim = textSimilarity(actualText, strippedExpected)
        const preferStripped = hasTextbookPlaceholder || strippedSim > fullSim
        const targetExpected = preferStripped ? strippedExpected : expectedText
        replacementText = preferStripped ? strippedRaw : rawExpected
        if (actualText !== targetExpected) {
          const similarity = Math.max(fullSim, strippedSim)
          if (similarity < TEXT_SIMILARITY_THRESHOLD) {
            errors.push(
              `Text mismatch for data-id "${dataId}": expected "${targetExpected.slice(0, 80)}" but got "${actualText.slice(0, 80)}"`
            )
          }
        }
      }
    }
  }

  if (node.children) {
    for (const child of node.children) {
      walkNode(child, allowedIds, imageIds, errors, options)
    }
  }

  if (replacementText !== undefined && !hasEditableElement(node)) {
    replaceChildrenWithText(node, replacementText)
  }
}

/** Collect all data-id attribute values from a DOM tree. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function hasGeneratedA11yLabelAncestor(node: any): boolean {
  let current = node.parent
  while (current) {
    if (current.attribs?.["data-generated-a11y-label"] === "true") {
      return true
    }
    current = current.parent
  }
  return false
}

/**
 * True if the node sits inside an element with a screen-reader-only utility
 * class (`sr-only` from Tailwind, or the historical `visually-hidden` /
 * `screen-reader-only` aliases). Such content is invisible to sighted users
 * and exists purely for assistive tech.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function hasSrOnlyAncestor(node: any): boolean {
  let current = node.parent
  while (current) {
    if (current.type === "tag") {
      const cls = current.attribs?.class
      if (typeof cls === "string") {
        const tokens = cls.split(/\s+/)
        if (
          tokens.includes("sr-only") ||
          tokens.includes("visually-hidden") ||
          tokens.includes("screen-reader-only")
        ) {
          return true
        }
      }
    }
    current = current.parent
  }
  return false
}

/**
 * True if the node sits inside an element marked aria-hidden="true". Such
 * content is purely decorative (screen readers skip it), so short visual
 * characters like "→", "/", "•" used as separators or icons don't need a
 * data-id. Relaxing this keeps the validator consistent with prompt
 * guidance that already uses aria-hidden spans for decorative glyphs.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function hasAriaHiddenAncestor(node: any): boolean {
  let current = node.parent
  while (current) {
    if (current.attribs?.["aria-hidden"] === "true") {
      return true
    }
    current = current.parent
  }
  return false
}

function collectDataIds(node: any, ids: Set<string>): void {
  if (node.type === "tag" && node.attribs?.["data-id"]) {
    ids.add(node.attribs["data-id"])
  }
  if (node.children) {
    for (const child of node.children) {
      collectDataIds(child, ids)
    }
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
  return decodePossiblyMalformedHtmlEntities(text)
    .normalize("NFC")
    .replace(/\s+/g, " ")
    .trim()
}

/**
 * Remove textbook-style blank placeholders (___ or ...) and inline
 * [placeholder:word] markers from text, then collapse the whitespace gaps
 * left behind. Used when the LLM has correctly replaced a visual blank with
 * an editable element (textarea or input) and the surrounding label text
 * therefore omits the placeholder.
 *
 * Also collapses orphan separator runs left behind when a split field like
 * `___/___/___` (date) or `___-___-___` (phone) is stripped — those slashes
 * and dashes belong between inputs, not in the label text.
 */
function stripBlankPlaceholders(text: string): string {
  // Order matters: `[placeholder:...]` markers must be removed first so the
  // dot-run regex doesn't eat their contents and leave a literal `[placeholder:]`
  // behind that no longer matches PLACEHOLDER_MARKER_RE.
  return text
    .replace(PLACEHOLDER_MARKER_RE, "")
    .replace(TEXTBOOK_BLANK_RE, "")
    .replace(ORPHAN_SEPARATOR_RUN_RE, "")
    .replace(/\s+/g, " ")
    .trim()
}

// Matches 2+ separator characters (/ or -) separated only by whitespace —
// the kind of leftover you get after stripping placeholder runs from
// "___/___/___". Real data like "2024/01/15" has alphanumerics between the
// separators, so it won't match.
const ORPHAN_SEPARATOR_RUN_RE = /([/\-])(\s*[/\-])+/g

function repairMalformedHtmlEntities(html: string): string {
  let repaired = html

  // Convert malformed numeric entities like "&#da0;" to valid hex entities.
  repaired = repaired.replace(/&#([0-9a-fA-F]*[a-fA-F][0-9a-fA-F]*);/g, "&#x$1;")

  // Repair truncated numeric entities missing semicolons before whitespace/tag/end.
  repaired = repaired.replace(/&#x([0-9a-fA-F]+)(?=\s|<|$)/gi, "&#x$1;")
  repaired = repaired.replace(
    /&#([0-9a-fA-F]*[a-fA-F][0-9a-fA-F]*)(?=\s|<|$)/g,
    "&#x$1;"
  )

  return repaired
}

function decodePossiblyMalformedHtmlEntities(text: string): string {
  let repaired = text

  // Repair malformed numeric entities like "&#da0;" where "x" is missing.
  repaired = repaired.replace(/&#([0-9a-fA-F]+);/g, (full, body: string) => {
    if (/^[0-9]+$/.test(body)) return full
    return `&#x${body};`
  })

  // Repair truncated numeric entities at the end (missing semicolon).
  repaired = repaired.replace(/&#x([0-9a-fA-F]+)$/i, "&#x$1;")
  repaired = repaired.replace(/&#(?!x)([0-9a-fA-F]+)$/i, (full, body: string) => {
    if (/^[0-9]+$/.test(body)) return `&#${body};`
    return `&#x${body};`
  })

  // Drop dangling entity starters left by truncated model output.
  repaired = repaired.replace(/&#(?:x)?$/i, "")

  repaired = repaired.replace(/&#x([0-9a-fA-F]+);/g, (full, hex: string) =>
    decodeCodePoint(parseInt(hex, 16), full)
  )
  repaired = repaired.replace(/&#([0-9]+);/g, (full, decimal: string) =>
    decodeCodePoint(parseInt(decimal, 10), full)
  )
  repaired = repaired.replace(
    /&([a-zA-Z][a-zA-Z0-9]+);/g,
    (full, entityName: string) => NAMED_HTML_ENTITIES[entityName] ?? full
  )

  return repaired
}

function decodeCodePoint(value: number, fallback: string): string {
  if (!Number.isInteger(value) || value < 0 || value > 0x10ffff) {
    return fallback
  }
  try {
    return String.fromCodePoint(value)
  } catch {
    return fallback
  }
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
