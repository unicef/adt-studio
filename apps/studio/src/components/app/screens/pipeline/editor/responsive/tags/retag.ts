import type { AnyNode, EditorDocument, EditorStore } from "adt-html-editor"

export const editableTags = ["p", "h1", "h2", "h3", "h4", "h5", "h6", "span", "div", "section", "article", "aside", "blockquote", "header", "footer", "nav"] as const
const editable = new Set<string>(editableTags)
const inline = new Set("a abbr b bdi bdo br cite code data del dfn em i img ins kbd label mark q ruby rp rt s samp small span strong sub sup time u var wbr".split(" "))
const heading = (tag: string) => /^h[1-6]$/.test(tag)
const restrictedParent = new Set("ul ol menu dl table thead tbody tfoot tr colgroup select optgroup datalist picture svg math".split(" "))

export function retagOptions(doc: EditorDocument, id: string, locked: Record<string, true>, editing: string | null): { tags: readonly string[]; reason: "unsupported" | "locked" | "editing" | null } {
  const node = doc.nodes[id]
  if (node?.kind !== "element" || id === doc.rootId || !node.parentId || !editable.has(node.tag)) return { tags: [], reason: "unsupported" as const }
  const ancestors: AnyNode[] = []
  for (let parent: AnyNode | undefined = doc.nodes[node.parentId]; parent; parent = parent.parentId ? doc.nodes[parent.parentId] : undefined) ancestors.push(parent)
  const descendants: AnyNode[] = []
  const pending = [...node.children]
  while (pending.length) {
    const child = doc.nodes[pending.pop()!]
    if (!child) return { tags: [], reason: "unsupported" as const }
    descendants.push(child)
    if (child.kind === "element") pending.push(...child.children)
  }
  if ([node, ...ancestors, ...descendants].some(item => locked[item.id])) return { tags: [], reason: "locked" as const }
  if (editing) return { tags: [], reason: "editing" as const }
  const parent = doc.nodes[node.parentId]
  if (parent?.kind !== "element" || restrictedParent.has(parent.tag)
    || node.children.some(child => doc.nodes[child]?.parentId !== id)) return { tags: [], reason: "unsupported" as const }
  const tags = editableTags.filter(tag => {
    if (tag === node.tag) return true
    const phrasing = tag === "p" || tag === "span" || heading(tag)
    if (phrasing && descendants.some(child => child.kind === "element" ? !inline.has(child.tag)
      : child.kind === "opaque" && !["svg", "math"].includes(child.tag))) return false
    // Inline ancestors constrain the replacement even through transparent links.
    if (tag !== "span" && ancestors.some(item => item.kind === "element"
      && (["p", "pre", "button", "legend", "summary"].includes(item.tag) || heading(item.tag) || (inline.has(item.tag) && !["a", "del", "ins"].includes(item.tag))))) return false
    if (parent.tag === "hgroup" && tag !== "p" && !heading(tag)) return false
    if ((tag === "header" || tag === "footer") && [...ancestors, ...descendants].some(item => item.kind === "element" && ["header", "footer"].includes(item.tag))) return false
    if (["article", "aside", "nav", "header", "footer"].includes(tag) && descendants.some(item => item.kind === "element" && item.tag === "main")) return false
    if ((heading(tag) || ["section", "article", "aside", "nav", "header", "footer"].includes(tag)) && ancestors.some(item => item.kind === "element" && ["address", "dt"].includes(item.tag))) return false
    return true
  })
  return { tags, reason: null }
}

// The installed editor has no setTag action. Use its public transaction API to
// replace just the outer element; move existing children rather than reparsing
// them. Authored IDs, attrs, class order, text, comments and descendant editor IDs
// survive. Only the replaced element receives a new internal editor ID.
export function retagElement(store: EditorStore, id: string, tag: string) {
  const { doc, locked, editingTextId, selectedIds, collapsed } = store.state
  const node = doc.nodes[id]
  if (selectedIds.length !== 1 || selectedIds[0] !== id || node?.kind !== "element" || !node.parentId
    || tag === node.tag || !retagOptions(doc, id, locked, editingTextId).tags.some(value => value === tag)) return null
  const parent = doc.nodes[node.parentId]
  if (parent?.kind !== "element" || !parent.children.includes(id)) return null
  const editor = store.actions
  return editor.transaction(() => {
    const replacement = editor.insertNode({ tag, attrs: { ...node.attrs }, classes: [...node.classes] }, { parentId: parent.id, index: parent.children.indexOf(id) })
    if (!replacement) return null
    for (const [index, child] of node.children.entries()) {
      if (editor.moveNode(child, { parentId: replacement, index })) continue
      // Never remove the old node unless every child has been transferred.
      node.children.forEach((child, index) => editor.moveNode(child, { parentId: id, index }))
      editor.removeNode(replacement); editor.select(id)
      return null
    }
    editor.removeNode(id)
    editor.select(replacement)
    if (collapsed[id]) editor.setCollapsed(replacement, true)
    return replacement
  })
}
