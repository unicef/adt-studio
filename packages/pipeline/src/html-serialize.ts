import { parseDocument, DomUtils } from "htmlparser2"

type SerializeOptions = Parameters<typeof DomUtils.getOuterHTML>[1]
type AnyNode = Parameters<typeof DomUtils.getOuterHTML>[0]
type TextLike = { type: string; data: string }

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
        parseDocument(`<span>${child.data}</span>`),
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
    return DomUtils.getOuterHTML(node, options)
  } finally {
    for (const [child, original] of restore) child.data = original
  }
}

export function serializeInnerHtml(node: Parameters<typeof DomUtils.getInnerHTML>[0], options?: SerializeOptions): string {
  const restore = decodeTextareaText(node as AnyNode)
  try {
    return DomUtils.getInnerHTML(node, options)
  } finally {
    for (const [child, original] of restore) child.data = original
  }
}
