import { parseDocument } from "htmlparser2"
import { headingLevelForRole } from "@adt/types"

interface HtmlNode {
  name?: string
  data?: string
  attribs?: Record<string, string>
  parent?: HtmlNode | null
  children?: HtmlNode[]
}

interface LeafText {
  text_id: string
  text_type: string
  heading_level?: number
}

const STANDARD_TEXT_SIZE_RE = /^text-(?:xs|sm|base|lg|xl|[2-9]xl)$/
const ARBITRARY_TEXT_SIZE_RE = /^(?:length:|(?:calc|clamp|min|max|var)\(|-?(?:\d|\.\d)|.*(?:px|r?em|vw|vh|vmin|vmax|ch|ex|%).*|(?:xx?-small|small|medium|large|x-large|xx-large|xxx-large|smaller|larger)|.*font-?size.*)$/i
const HEADING_CLASS_RE = /^adt-h[1-6]$/

function utilityWithoutVariants(token: string): string {
  let bracketDepth = 0
  let lastVariantColon = -1
  for (let index = 0; index < token.length; index++) {
    const char = token[index]
    if (char === "[") bracketDepth++
    else if (char === "]") bracketDepth = Math.max(0, bracketDepth - 1)
    else if (char === ":" && bracketDepth === 0) lastVariantColon = index
  }
  return token.slice(lastVariantColon + 1).replace(/^!/, "")
}

function isFontSizeUtility(token: string): boolean {
  const utility = utilityWithoutVariants(token)
  if (STANDARD_TEXT_SIZE_RE.test(utility)) return true
  const match = utility.match(/^text-\[(.*)\]$/)
  return match ? ARBITRARY_TEXT_SIZE_RE.test(match[1].trim()) : false
}

function headingClasses(node: HtmlNode): string[] {
  return (node.attribs?.class?.split(/\s+/) ?? []).filter((className) =>
    HEADING_CLASS_RE.test(className),
  )
}

function textContent(node: HtmlNode): string {
  return `${node.data ?? ""}${(node.children ?? []).map(textContent).join("")}`
}

function walk(node: HtmlNode, callback: (node: HtmlNode) => void): void {
  callback(node)
  for (const child of node.children ?? []) walk(child, callback)
}

function findByDataId(root: HtmlNode, id: string): HtmlNode | undefined {
  let match: HtmlNode | undefined
  walk(root, (node) => {
    if (!match && node.attribs?.["data-id"] === id) match = node
  })
  return match
}

function closestHeading(node: HtmlNode | undefined): HtmlNode | undefined {
  let current = node
  while (current) {
    if (/^h[1-6]$/.test(current.name ?? "")) return current
    current = current.parent ?? undefined
  }
  return undefined
}

function containsHeading(node: HtmlNode): boolean {
  if (/^h[1-6]$/.test(node.name ?? "")) return true
  return (node.children ?? []).some(containsHeading)
}

function hasClass(node: HtmlNode, className: string): boolean {
  return (node.attribs?.class?.split(/\s+/) ?? []).includes(className)
}

function headingSubtreeErrors(heading: HtmlNode, expectedLevel: number): string[] {
  const expectedClass = `adt-h${expectedLevel}`
  const errors: string[] = []
  const scaleClasses = headingClasses(heading)

  if (!hasClass(heading, expectedClass) || scaleClasses.length !== 1) {
    errors.push(`Retained <h${expectedLevel}> must keep exactly one matching "${expectedClass}" class.`)
  }

  walk(heading, (node) => {
    const classes = node.attribs?.class ?? ""
    if (node !== heading && headingClasses(node).length > 0) {
      errors.push("Book-wide adt-h* typography classes may only appear on the semantic heading element.")
    }
    if (classes.split(/\s+/).some(isFontSizeUtility)) {
      errors.push(`Retained headings must not use a font-size utility: "${classes}".`)
    }
    if (/(?:^|;)\s*font(?:-size)?\s*:/i.test(node.attribs?.style ?? "")) {
      errors.push("Retained headings must not use inline font/font-size; use the book-wide adt-h* class.")
    }
    if (node.name === "style" && /\bfont(?:-size)?\s*:/i.test(textContent(node))) {
      errors.push("Retained headings must not define font/font-size rules in a nested <style> block.")
    }
  })

  return [...new Set(errors)]
}

function hasStrictHeadingTypography(heading: HtmlNode, level: number): boolean {
  return headingSubtreeErrors(heading, level).length === 0
}

export interface TypographyHierarchyOptions {
  /** Activity/overlay controls may size non-heading UI text independently. */
  allowNonHeadingFontSizes?: boolean
}

/** Enforce the sectioning hierarchy and prevent per-page heading-size overrides. */
export function validateTypographyHierarchy(
  html: string,
  leafTexts: LeafText[],
  options: TypographyHierarchyOptions = {},
): string[] {
  const root = parseDocument(html) as unknown as HtmlNode
  const errors: string[] = []

  walk(root, (node) => {
    const classes = node.attribs?.class ?? ""
    const controlsHeading = closestHeading(node) !== undefined || containsHeading(node)
    const scaleClasses = headingClasses(node)
    if (
      controlsHeading &&
      scaleClasses.length > 0 &&
      !/^h[1-6]$/.test(node.name ?? "")
    ) {
      errors.push("Book-wide adt-h* typography classes may only appear on the semantic heading element.")
    }
    const hasSizeUtility = classes.split(/\s+/).some(isFontSizeUtility)
    if (hasSizeUtility && (!options.allowNonHeadingFontSizes || controlsHeading)) {
      errors.push(`Typography must not use a font-size utility: "${classes}".`)
    }
    if (
      /(?:^|;)\s*font(?:-size)?\s*:/i.test(node.attribs?.style ?? "") &&
      (!options.allowNonHeadingFontSizes || controlsHeading)
    ) {
      errors.push("Typography must not use inline font/font-size; use the book-wide adt-* class.")
    }
    if (node.name === "style" && /\bfont(?:-size)?\s*:/i.test(textContent(node))) {
      errors.push("Typography must not define page-local font/font-size rules in a <style> block.")
    }
  })

  for (const leaf of leafTexts) {
    const roleLevel = headingLevelForRole(leaf.text_type)
    const expectedLevel = leaf.heading_level ?? roleLevel
    const isLegacyHeading = leaf.text_type === "heading"
    if (!expectedLevel && !isLegacyHeading) continue

    const content = findByDataId(root, leaf.text_id)
    const heading = closestHeading(content)
    if (!heading) {
      errors.push(`Heading "${leaf.text_id}" must be rendered inside a semantic <h1> through <h6>.`)
      continue
    }

    if (expectedLevel) {
      const expectedTag = `h${expectedLevel}`
      const expectedClass = `adt-h${expectedLevel}`
      const scaleClasses = headingClasses(heading)
      if (
        heading.name !== expectedTag ||
        !hasClass(heading, expectedClass) ||
        scaleClasses.length !== 1
      ) {
        errors.push(
          `Heading role "${leaf.text_type}" (${leaf.text_id}) must use <${expectedTag} class="${expectedClass}">.`,
        )
      }
      continue
    }

    const level = heading.name?.slice(1)
    const expectedClass = `adt-h${level}`
    if (
      !level ||
      !["1", "2", "3", "4", "5", "6"].includes(level) ||
      !hasClass(heading, expectedClass) ||
      headingClasses(heading).length !== 1
    ) {
      errors.push(
        `Legacy heading "${leaf.text_id}" must align its semantic tag with its typography class (h1/adt-h1 through h6/adt-h6).`,
      )
    }
  }

  return [...new Set(errors)]
}

/**
 * Preserve the semantic level of headings that survive an HTML edit. Current
 * adt-h* headings retain the full type-scale contract, while older headings
 * keep their semantic tag without being migrated by an unrelated edit.
 *
 * Heading data IDs may live on the heading itself or on descendants when a
 * heading is split into styled spans. IDs intentionally removed by the edit
 * are omitted from validation so the existing AI-edit deletion policy remains
 * unchanged.
 */
export function validateRetainedHeadingHierarchy(
  originalHtml: string,
  editedHtml: string,
): string[] {
  const originalRoot = parseDocument(originalHtml) as unknown as HtmlNode
  const editedRoot = parseDocument(editedHtml) as unknown as HtmlNode
  const errors: string[] = []
  const seenIds = new Set<string>()

  walk(originalRoot, (node) => {
    const levelText = /^h([1-6])$/.exec(node.name ?? "")?.[1]
    if (!levelText) return
    const level = Number(levelText)
    const originalIsStrict = hasStrictHeadingTypography(node, level)

    walk(node, (descendant) => {
      const textId = descendant.attribs?.["data-id"]
      if (
        !textId ||
        seenIds.has(textId) ||
        closestHeading(descendant) !== node ||
        !findByDataId(editedRoot, textId)
      ) {
        return
      }
      seenIds.add(textId)
      const editedHeading = closestHeading(findByDataId(editedRoot, textId))
      if (!editedHeading) {
        errors.push(`Heading "${textId}" must remain inside semantic <h${level}> markup.`)
        return
      }

      if (editedHeading.name !== `h${level}`) {
        errors.push(`Heading "${textId}" must remain <h${level}>; found <${editedHeading.name ?? "unknown"}>.`)
        return
      }

      if (originalIsStrict) {
        errors.push(...headingSubtreeErrors(editedHeading, level))
        return
      }

      // Older renderings may predate the adt-h* type scale. Preserve their
      // semantic tag without forcing an unrelated AI edit to migrate their
      // typography. Adopting the correct class is fine; introducing a
      // conflicting hierarchy class is not.
      const scaleClasses = headingClasses(editedHeading)
      if (scaleClasses.some((className) => className !== `adt-h${level}`)) {
        errors.push(`Heading "${textId}" must not introduce an adt-h* class for a different level.`)
      }
    })
  })

  if (errors.length === 0) return []

  return [
    ...new Set(errors),
    "AI editing must preserve each retained heading's semantic tag. Current adt-h* headings must also keep their matching book-wide class and size. Change heading rank in Sectioning or book-wide size in Fonts instead.",
  ]
}
