// Characters XML 1.0 forbids, even as character references: C0 controls other
// than tab/LF/CR, U+FFFE/U+FFFF and unpaired surrogates. PDF text extraction
// can carry them; one of them makes a whole XML document ill-formed.
const XML_INVALID = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g

/** Drop the characters no XML document may contain. They carry no visible
 * content, so writers of XML (manifests, XHTML, OPF, NCX, SMIL) remove them
 * instead of producing a file that strict readers refuse. */
export function stripXmlInvalid(s: string): string {
  return s.replace(XML_INVALID, "")
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
