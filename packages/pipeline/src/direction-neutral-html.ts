import { parseDocument, DomUtils } from "htmlparser2"
import type { TextDirection } from "@adt/types"

/**
 * Direction-neutral page HTML (SPEC-0024).
 *
 * A book has one page layout for all of its languages: the reader swaps the
 * translated words into the same HTML and flips the page direction. So a page
 * must not say "left" or "right" about its text or its floated boxes. This
 * rewrites the ways generated pages do:
 *
 * - `text-left` / `text-right` become `text-start` / `text-end`, mapped for
 *   the direction the page was written in, so the page looks exactly as before
 *   in its own language and mirrors in the other one.
 * - `float-left` / `float-right`, and the `clear-*` that goes with them, become
 *   `float-start` / `float-end` the same way, so a box the text wraps around
 *   changes side together with the text. The gap beside the box (`ml-8`,
 *   `mr-8` on the floated element) moves with it.
 * - a `dir` attribute that only repeats the direction the element already
 *   has is removed. Left in, it pins the block to that direction when the
 *   reader switches language.
 */

// Hebrew, Arabic (incl. supplement and extended-A), Syriac, Thaana, N'Ko, and
// the Hebrew/Arabic presentation forms.
const RTL_LETTER_RE = /[֐-ࣿיִ-﷿ﹰ-﻿]/

const ALIGNMENT_TOKEN_RE = /^text-(left|right|center|justify|start|end)$/
// A physical utility, with any variant prefix (`md:text-left`): text alignment,
// or a float and the `clear` that goes with it.
const PHYSICAL_TOKEN_RE = /^((?:[^\s:]+:)*)(text|float|clear)-(left|right)$/
const FLOAT_TOKEN_RE = /^(?:[^\s:]+:)*float-(?:left|right|start|end)$/
// A physical side margin (`ml-8`, `lg:-mr-2`): the gap beside a floated box.
const PHYSICAL_MARGIN_RE = /^((?:[^\s:]+:)*-?m)([lr])(-.+)$/

type Side = "left" | "right"

export interface NeutralizeOptions {
  /**
   * In a right-to-left page, treat `text-left` on right-to-left text as a
   * mistake and align it to the start instead of preserving it at the end.
   * Changes how the page looks, so it is for newly generated HTML only —
   * never for pages a person has already seen and edited.
   */
  correctMisalignedText?: boolean
}

interface Element {
  type: string
  name?: string
  attribs?: Record<string, string>
  children?: Element[]
  startIndex?: number | null
}

function classTokens(el: Element): string[] {
  return (el.attribs?.class ?? "").split(/\s+/).filter(Boolean)
}

/** Index of the `>` that closes the opening tag starting at `start`. */
function openingTagEnd(html: string, start: number): number {
  let quote: string | null = null
  for (let i = start; i < html.length; i++) {
    const char = html[i]
    if (quote) {
      if (char === quote) quote = null
    } else if (char === '"' || char === "'") {
      quote = char
    } else if (char === ">") {
      return i
    }
  }
  return -1
}

export function neutralizeDirectionMarkup(
  html: string,
  pageDirection: TextDirection,
  options: NeutralizeOptions = {},
): string {
  if (!/\b(?:text|clear)-(?:left|right)\b|\bfloat-(?:left|right|start|end)\b|\bdir\s*=/.test(html)) return html

  const logicalFor = (side: Side, el: Element): "start" | "end" => {
    if (pageDirection === "ltr") return side === "left" ? "start" : "end"
    if (side === "right") return "start"
    const rtlText = RTL_LETTER_RE.test(DomUtils.textContent(el as never))
    return options.correctMisalignedText && rtlText ? "start" : "end"
  }

  // A float is layout, not text: it keeps the side it was given in the page's
  // own direction, whatever script is inside it.
  const layoutSide = (side: Side): "start" | "end" =>
    (side === "left") === (pageDirection === "ltr") ? "start" : "end"

  /** The logical form of a physical class token, or null if it is not one. */
  const logicalToken = (token: string, el: Element, floated: boolean): string | null => {
    const match = PHYSICAL_TOKEN_RE.exec(token)
    if (match) {
      const [, variants, utility, side] = match
      const logical = utility === "text" ? logicalFor(side as Side, el) : layoutSide(side as Side)
      return `${variants}${utility}-${logical}`
    }
    const margin = floated ? PHYSICAL_MARGIN_RE.exec(token) : null
    if (!margin) return null
    return `${margin[1]}${layoutSide(margin[2] === "l" ? "left" : "right") === "start" ? "s" : "e"}${margin[3]}`
  }

  // Decide per element, then patch only the opening tags that change. The
  // document is never re-serialised, so everything else stays byte-identical.
  const patches: Array<{ start: number; end: number; tag: string }> = []

  const visit = (node: Element, inheritedSide: Side | null, inheritedDir: TextDirection): void => {
    if (node.type !== "tag" && node.type !== "script" && node.type !== "style") {
      for (const child of node.children ?? []) visit(child, inheritedSide, inheritedDir)
      return
    }
    const tokens = classTokens(node)
    const ownAlignment = tokens.find((token) => ALIGNMENT_TOKEN_RE.test(token)) ?? null
    const ownSide: Side | null =
      ownAlignment === "text-left" ? "left" : ownAlignment === "text-right" ? "right" : null
    // Any explicit alignment of its own ends the inheritance of a physical one.
    const side = ownAlignment ? ownSide : inheritedSide

    const dirAttr = node.attribs?.dir?.toLowerCase()
    const ownDir = dirAttr === "ltr" || dirAttr === "rtl" ? dirAttr : null
    const redundantDir = ownDir !== null && ownDir === inheritedDir
    const dir = ownDir ?? inheritedDir

    const floated = tokens.some((token) => FLOAT_TOKEN_RE.test(token))
    const physical = tokens.some((token) => logicalToken(token, node, floated) !== null)
    // A table header centres itself unless an ancestor sets alignment
    // explicitly, and `start`/`end` do not count as explicit. So a header that
    // was inheriting left/right has to carry the logical class itself.
    const headerNeedsClass = node.name === "th" && !ownAlignment && inheritedSide !== null

    if ((physical || redundantDir || headerNeedsClass) && typeof node.startIndex === "number") {
      const start = node.startIndex
      const end = openingTagEnd(html, start)
      if (end > start) {
        let tag = html.slice(start, end + 1)
        if (physical) {
          tag = tag.replace(/(\sclass\s*=\s*)(["'])([\s\S]*?)\2/, (_match, prefix: string, quote: string, value: string) =>
            `${prefix}${quote}${value
              .split(/(\s+)/)
              .map((token) => logicalToken(token, node, floated) ?? token)
              .join("")}${quote}`)
        }
        if (headerNeedsClass) {
          const added = `text-${logicalFor(inheritedSide as Side, node)}`
          tag = /\sclass\s*=\s*(["'])/.test(tag)
            ? tag.replace(/(\sclass\s*=\s*)(["'])([\s\S]*?)\2/, (_match, prefix: string, quote: string, value: string) =>
                `${prefix}${quote}${value ? `${value} ` : ""}${added}${quote}`)
            : tag.replace(/^<th\b/i, (opening) => `${opening} class="${added}"`)
        }
        if (redundantDir) {
          tag = tag.replace(/\s+dir\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/i, "")
        }
        patches.push({ start, end: end + 1, tag })
      }
    }
    for (const child of node.children ?? []) visit(child, side, dir)
  }

  const doc = parseDocument(html, { withStartIndices: true }) as unknown as Element
  visit(doc, null, pageDirection)

  let out = html
  for (const patch of patches.sort((a, b) => b.start - a.start)) {
    out = out.slice(0, patch.start) + patch.tag + out.slice(patch.end)
  }
  return out
}
