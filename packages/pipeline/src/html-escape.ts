import { DomUtils } from "htmlparser2"

/**
 * Serialize a parsed HTML DOM (or one node) back to HTML, keeping non-ASCII
 * text and attribute values as literal UTF-8 (#907). htmlparser2's default
 * writes every non-ASCII character as a numeric entity (`Niño` becomes
 * `Ni&#xf1;o`), which renders the same but makes stored and exported HTML
 * unreadable. Only `& < >` in text and `& "` in attributes are escaped.
 * Pages declare `<meta charset="utf-8">`, so literal characters are safe.
 * Not for XHTML: `htmlToXhtml` keeps `xmlMode` and numeric references.
 */
export function serializeHtml(node: Parameters<typeof DomUtils.getOuterHTML>[0]): string {
  return DomUtils.getOuterHTML(node, { encodeEntities: "utf8" })
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
