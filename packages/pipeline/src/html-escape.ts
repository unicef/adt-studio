import { DomUtils, parseDocument } from "htmlparser2"

/**
 * Content htmlparser2 writes without entity encoding: comments and the
 * contents of raw-text elements. Their opening tags are encoded like any other
 * tag, and in that output a literal `>` never appears inside an attribute.
 */
const VERBATIM =
  /(<!--[\s\S]*?-->)|(<(script|style|xmp|iframe|noembed|noframes|noscript)\b[^>]*>)([\s\S]*?)(<\/\3\s*>)|(<plaintext\b[^>]*>)([\s\S]*)$/gi

/** Apply `fn` to every part of serialized HTML that the serializer encodes. */
function mapEncodedParts(html: string, fn: (part: string) => string): string {
  let out = ""
  let last = 0
  for (const m of html.matchAll(VERBATIM)) {
    out += fn(html.slice(last, m.index))
    if (m[1] !== undefined) out += m[1]
    else if (m[2] !== undefined) out += fn(m[2]) + m[4] + m[5]
    else out += fn(m[6]) + m[7]
    last = m.index + m[0].length
  }
  return out + fn(html.slice(last))
}

const VISIBLE = /^[\p{L}\p{M}\p{N}\p{P}\p{S}]$/u
/** Whether the serializer's numeric entity for `cp` is worth writing literally. */
function isReadable(cp: number): boolean {
  // Invisible and format characters (no-break space, soft hyphen, zero-width
  // and bidi controls, private use) stay as entities so they remain visible.
  return (cp === 0x24 || cp >= 0xa0) && VISIBLE.test(String.fromCodePoint(cp))
}

// Probe the serializer once, so the inverse below tracks its exact output.
const DOLLAR_ENCODED = DomUtils.getOuterHTML(parseDocument("<p>$</p>")).includes("&#x24;")

/**
 * Serialize a parsed HTML DOM (or one node) with visible non-ASCII characters
 * written as literal UTF-8 (#907): `La explicación`, not `La explicaci&#xf3;n`.
 *
 * It is the previous serialization with only the numeric entities of visible
 * characters decoded, so everything else is unchanged: `& < > " '` stay
 * escaped in text and attributes (a literal `<` or `>` in an attribute could
 * end a raw-text element when a browser re-parses it), invisible characters
 * stay as entities, and comments and script/style content are untouched.
 * `encodeLegacyEntities` restores the previous serialization exactly.
 * Not for XHTML: `htmlToXhtml` keeps `xmlMode` and numeric references.
 */
export function serializeHtml(node: Parameters<typeof DomUtils.getOuterHTML>[0]): string {
  return mapEncodedParts(DomUtils.getOuterHTML(node), (part) =>
    part.replace(/&#x([0-9a-f]+);/g, (entity, hex: string) => {
      const cp = parseInt(hex, 16)
      if (cp === 0x24 && !DOLLAR_ENCODED) return entity
      return isReadable(cp) ? String.fromCodePoint(cp) : entity
    }),
  )
}

/**
 * The inverse of `serializeHtml`'s decoding: HTML in the entity encoding that
 * pipeline serialization produced before #907. Activity IDs and LLM prompts
 * (whose text is the LLM cache key) use this form, so existing books keep
 * their activity IDs and cached responses.
 */
export function encodeLegacyEntities(html: string): string {
  return mapEncodedParts(html, (part) =>
    part.replace(/[$\u00a0-\u{10ffff}]/gu, (ch) => {
      const cp = ch.codePointAt(0)!
      if (cp === 0x24 && !DOLLAR_ENCODED) return ch
      return isReadable(cp) ? `&#x${cp.toString(16)};` : ch
    }),
  )
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

export function escapeAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
}

export function escapeInlineScriptJson(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029")
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
}
