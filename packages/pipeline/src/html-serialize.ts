import { parseDocument, DomUtils } from "htmlparser2"

type SerializeOptions = Parameters<typeof DomUtils.getOuterHTML>[1]
type AnyNode = Parameters<typeof DomUtils.getOuterHTML>[0]
type TextLike = { type: string; data: string }

/** Tokens htmlparser2 writes without entity encoding. */
const TOKEN =
  /<!--[\s\S]*?-->|<[!?][^>]*>|(<(script|style|xmp|iframe|noembed|noframes|noscript)(?=[\s/>])[^>]*(?<!\/)>)([\s\S]*?)(<\/\2\s*>)|(<plaintext(?=[\s/>])[^>]*(?<!\/)>)([\s\S]*)$|<[^>]*>/gi

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
const JOINERS = new Set([0x200c, 0x200d])
function isReadable(cp: number): boolean {
  return cp >= 0xa0 && VISIBLE.test(String.fromCodePoint(cp))
}

function makeReadable(html: string): string {
  return mapEncodedParts(html, (part) =>
    part.replace(/&#x([0-9a-f]+);/g, (entity, hex: string) => {
      const cp = parseInt(hex, 16)
      if (cp > 0x10ffff) return entity
      if (JOINERS.has(cp)) return String.fromCodePoint(cp)
      return isReadable(cp) ? String.fromCodePoint(cp) : entity
    }),
  )
}

/**
 * htmlparser2 keeps `<textarea>` text as raw (still entity-encoded) text, but
 * dom-serializer encodes text nodes on output. Serializing a parsed textarea
 * therefore adds one escaping layer per pass (`Don&apos;t` → `Don&amp;apos;t`).
 *
 * Decode the textarea text just for the duration of serialization so a
 * parse → serialize pass leaves the textarea content unchanged, then restore
 * the original node data so the DOM is not altered for later callers.
 */
function decodeTextareaText(roots: AnyNode): Array<[TextLike, string]> {
  const nodes = Array.isArray(roots) ? roots : [roots]
  const textareas = DomUtils.findAll(
    (el) => el.name === "textarea",
    nodes as Parameters<typeof DomUtils.findAll>[1],
  )
  // A root that is itself a textarea is not covered by findAll over its children.
  for (const root of nodes as Array<{ type: string; name?: string }>) {
    if (root.type === "tag" && root.name === "textarea") {
      textareas.push(root as (typeof textareas)[number])
    }
  }
  const changed: Array<[TextLike, string]> = []
  for (const textarea of textareas) {
    for (const child of textarea.children as unknown as TextLike[]) {
      if (child.type !== "text" || !child.data.includes("&")) continue
      const decoded = DomUtils.textContent(
        parseDocument(`<span>${child.data.replace(/</g, "&lt;")}</span>`),
      )
      if (decoded === child.data) continue
      changed.push([child, child.data])
      child.data = decoded
    }
  }
  return changed
}

export function serializeHtml(node: AnyNode, options?: SerializeOptions): string {
  const restore = decodeTextareaText(node)
  try {
    return makeReadable(DomUtils.getOuterHTML(node, options))
  } finally {
    for (const [child, original] of restore) child.data = original
  }
}

export function serializeInnerHtml(node: Parameters<typeof DomUtils.getInnerHTML>[0], options?: SerializeOptions): string {
  const restore = decodeTextareaText(node as AnyNode)
  try {
    return makeReadable(DomUtils.getInnerHTML(node, options))
  } finally {
    for (const [child, original] of restore) child.data = original
  }
}

/** Restore the entity encoding used before readable HTML serialization. */
export function encodeLegacyEntities(html: string): string {
  return mapEncodedParts(html, (part) =>
    part.replace(/[\u0080-\u{10ffff}]/gu, (ch) => `&#x${ch.codePointAt(0)!.toString(16)};`),
  )
}
