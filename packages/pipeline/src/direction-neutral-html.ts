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
 *
 * A `dir` that changes the direction is kept, and the classes on and inside
 * that element are mapped for its direction, not the page's: an English block
 * marked `dir="ltr"` in an Urdu page stays where it was, in both languages.
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
const LOGICAL_MARGIN_RE = /^((?:[^\s:]+:)*-?m)([se])(-.+)$/

type Side = "left" | "right"

/**
 * The directions an element's logical classes are resolved against. Text
 * alignment and margins follow the element's own direction; a float and its
 * `clear` follow the direction of the box the element sits in.
 */
interface Directions {
  own: TextDirection
  container: TextDirection
}

export interface NeutralizeOptions {
  /**
   * For a right-to-left page, also correct three things the model gets wrong,
   * instead of preserving them:
   * - `text-left` on right-to-left text is aligned to the start, not kept at
   *   the far side;
   * - a table-of-contents page number, which the TOC repair right-aligns for a
   *   left-to-right row, is aligned to the end of its cell;
   * - a floated box whose only side margin is on its outer side (`float-right`
   *   copied from a left-to-right example, next to `ms-8`) gets that gap on
   *   the text side, so the wrapped text does not touch the box.
   *
   * These change how the page looks, so this is for newly generated HTML only —
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

/**
 * The side (`s` or `e`) of a floated box's margin when it is on the outer side
 * only: the box sits against that edge and nothing separates it from the text.
 */
function outerOnlyGap(tokens: string[]): "s" | "e" | null {
  const float = tokens.find((token) => token === "float-start" || token === "float-end")
  if (!float) return null
  const outer = float === "float-start" ? "s" : "e"
  const sides = new Set(tokens.flatMap((token) => LOGICAL_MARGIN_RE.exec(token)?.[2] ?? []))
  const bothSides = tokens.some((token) => /^(?:[^\s:]+:)*-?mx-/.test(token))
  return sides.size === 1 && sides.has(outer) && !bothSides ? outer : null
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

  // The corrections are for a page written right to left, and only there.
  const correcting = options.correctMisalignedText === true && pageDirection === "rtl"

  // `start` and `end` mean a side only relative to a direction, and a `dir` on
  // the element or on an ancestor can set that apart from the page's. So each
  // class is mapped for the direction it will be resolved against (`Directions`
  // below), or a left-to-right block of a right-to-left page would change side.
  const logicalFor = (side: Side, el: Element, direction: TextDirection): "start" | "end" => {
    if (direction === "ltr") return side === "left" ? "start" : "end"
    if (side === "right") {
      const tocPageNumber = el.attribs?.["data-toc-page-number"] === "true"
      return correcting && tocPageNumber ? "end" : "start"
    }
    const rtlText = RTL_LETTER_RE.test(DomUtils.textContent(el as never))
    return correcting && rtlText ? "start" : "end"
  }

  // A float is layout, not text: it keeps the side it was given, whatever
  // script is inside it.
  const layoutSide = (side: Side, direction: TextDirection): "start" | "end" =>
    (side === "left") === (direction === "ltr") ? "start" : "end"

  /** The logical form of a physical class token, or null if it is not one. */
  const logicalToken = (token: string, el: Element, floated: boolean, directions: Directions): string | null => {
    const match = PHYSICAL_TOKEN_RE.exec(token)
    if (match) {
      const [, variants, utility, side] = match
      const logical =
        utility === "text"
          ? logicalFor(side as Side, el, directions.own)
          : layoutSide(side as Side, directions.container)
      return `${variants}${utility}-${logical}`
    }
    const margin = floated ? PHYSICAL_MARGIN_RE.exec(token) : null
    if (!margin) return null
    return `${margin[1]}${layoutSide(margin[2] === "l" ? "left" : "right", directions.own) === "start" ? "s" : "e"}${margin[3]}`
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

    const directions: Directions = { own: dir, container: inheritedDir }
    const floated = tokens.some((token) => FLOAT_TOKEN_RE.test(token))
    // The gap correction reads the float and its margin as one pair, so it is
    // left alone where the two are resolved against different directions.
    const gapToMove =
      correcting && floated && directions.own === directions.container
        ? outerOnlyGap(tokens.map((token) => logicalToken(token, node, floated, directions) ?? token))
        : null
    /** The class token as it should be stored. */
    const rewritten = (token: string): string => {
      const logical = logicalToken(token, node, floated, directions) ?? token
      const margin = gapToMove ? LOGICAL_MARGIN_RE.exec(logical) : null
      return margin && margin[2] === gapToMove ? `${margin[1]}${gapToMove === "s" ? "e" : "s"}${margin[3]}` : logical
    }
    const physical = tokens.some((token) => rewritten(token) !== token)
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
          tag = tag.replace(/(\sclass\s*=\s*)(["'])([\s\S]*?)\2/, (_match, prefix: string, quote: string, value: string) => {
            const parts = value.split(/(\s+)/)
            const present = new Set(parts.filter((part) => part.trim() && rewritten(part) === part))
            const kept: string[] = []
            for (const part of parts) {
              const logical = rewritten(part)
              if (logical === part) {
                kept.push(part)
                continue
              }
              // Already there (a repair step re-added the physical class to an
              // element converted earlier): drop it with the space before it.
              if (present.has(logical)) {
                if (kept.length > 0 && /^\s+$/.test(kept[kept.length - 1])) kept.pop()
                continue
              }
              present.add(logical)
              kept.push(logical)
            }
            return `${prefix}${quote}${kept.join("")}${quote}`
          })
        }
        if (headerNeedsClass) {
          const added = `text-${logicalFor(inheritedSide as Side, node, dir)}`
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
