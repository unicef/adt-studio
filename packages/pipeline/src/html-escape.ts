import { DomUtils } from "htmlparser2"

/**
 * Tokens of htmlparser2's serialized HTML. Only text and attribute values are
 * entity-encoded by the serializer: comments, directives, tag and attribute
 * names, and the contents of raw-text elements are written verbatim. In that
 * output a literal `>` never appears inside an attribute value, so `[^>]*`
 * spans a whole tag. Self-closed raw-text tags (`<style/>` inside SVG) have
 * no contents. Noscript, iframe, noembed and noframes are copied whole, so
 * any markup htmlparser2 parsed inside them stays entity-encoded.
 */
const TOKEN =
  /<!--[\s\S]*?-->|<[!?][^>]*>|(<(script|style|xmp|iframe|noembed|noframes|noscript)(?=[\s/>])[^>]*(?<!\/)>)([\s\S]*?)(<\/\2\s*>)|(<plaintext(?=[\s/>])[^>]*(?<!\/)>)([\s\S]*)$|<[^>]*>/gi

/** Apply `fn` to every part of serialized HTML that the serializer encodes. */
function mapEncodedParts(html: string, fn: (part: string) => string): string {
  const attributeValues = (tag: string) => tag.replace(/="([^"]*)"/g, (_m, value: string) => `="${fn(value)}"`)
  let out = ""
  let last = 0
  for (const m of html.matchAll(TOKEN)) {
    out += fn(html.slice(last, m.index))
    if (m[1] !== undefined) out += attributeValues(m[1]) + m[3] + m[4]
    else if (m[5] !== undefined) out += attributeValues(m[5]) + m[6]
    else if (m[0].startsWith("<!") || m[0].startsWith("<?")) out += m[0]
    else out += attributeValues(m[0])
    last = m.index + m[0].length
  }
  return out + fn(html.slice(last))
}

const VISIBLE = /^[\p{L}\p{M}\p{N}\p{P}\p{S}]$/u
/** Zero-width non-joiner and joiner: parts of words (Persian) and emoji sequences. */
const JOINERS = new Set([0x200c, 0x200d])

/**
 * Serialize a parsed HTML DOM (or one node) with visible non-ASCII characters
 * written as literal UTF-8 (#907): `La explicación`, not `La explicaci&#xf3;n`.
 *
 * It is htmlparser2's previous serialization with only the numeric entities
 * of visible non-ASCII characters decoded, in text and attribute values.
 * Everything else is byte-for-byte unchanged: `& < > " '` stay escaped (a
 * literal `<` or `>` in an attribute could end a raw-text element when a
 * browser re-parses the page), `$` stays `&#x24;`, invisible and format
 * characters (no-break space, zero-width and bidi controls, private use) stay
 * as entities, and verbatim parts are untouched. Note that the serializer
 * itself writes the text of raw-text elements (`<noscript>`, `<iframe>`, …)
 * unescaped; this helper does not change that.
 * `encodeLegacyEntities` restores the previous serialization exactly.
 * Not for XHTML: `htmlToXhtml` keeps `xmlMode` and numeric references.
 */
export function serializeHtml(node: Parameters<typeof DomUtils.getOuterHTML>[0]): string {
  return mapEncodedParts(DomUtils.getOuterHTML(node), (part) =>
    part.replace(/&#x([0-9a-f]+);/g, (entity, hex: string) => {
      const cp = parseInt(hex, 16)
      if (cp < 0xa0 || cp > 0x10ffff) return entity
      if (JOINERS.has(cp)) return String.fromCodePoint(cp)
      const ch = String.fromCodePoint(cp)
      return VISIBLE.test(ch) ? ch : entity
    }),
  )
}

/**
 * HTML from `serializeHtml` in the entity encoding pipeline serialization
 * produced before #907 (every non-ASCII character in text and attribute
 * values as a numeric entity). Prompts built from freshly validated HTML and
 * the activity-ID hash use this form, so existing books keep their activity
 * IDs and LLM cache hits. Prompts built from stored HTML pass it as stored.
 */
export function encodeLegacyEntities(html: string): string {
  return mapEncodedParts(html, (part) =>
    part.replace(/[\u0080-\u{10ffff}]/gu, (ch) => `&#x${ch.codePointAt(0)!.toString(16)};`),
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
