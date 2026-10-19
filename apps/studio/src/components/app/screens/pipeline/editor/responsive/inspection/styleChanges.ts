import type { EditorDocument } from "adt-html-editor"

export function declarations(value = "") {
  const style = document.createElement("div").style
  style.cssText = value
  return Object.fromEntries(Array.from(style).map(property => [property,
    // eslint-disable-next-line lingui/no-unlocalized-strings -- Literal CSS priority syntax.
    `${style.getPropertyValue(property)}${style.getPropertyPriority(property) ? " !important" : ""}`]))
}

export function elementLabel(doc: EditorDocument, id: string) {
  const node = doc.nodes[id]
  if (!node || !("tag" in node)) return node?.kind ?? id
  const name = node.attrs.id || node.attrs["data-id"]
  if (name) return `${node.tag}#${name}`
  function text(key: string, limit = 32): string {
    const item = doc.nodes[key]
    if (item?.kind === "text") return item.value.replace(/\s+/g, " ").trim().slice(0, limit)
    let content = ""
    if (item?.kind === "element") for (const child of item.children) {
      if (content.length >= limit) break
      const value = text(child, limit - content.length)
      if (value) content += `${content ? " " : ""}${value}`
    }
    return content.slice(0, limit)
  }
  const content = text(id).replace(/\s+/g, " ").trim().slice(0, 32)
  return content ? `${node.tag} · ${content}` : node.tag
}

export function styleEntry(id: string, label: string, source: "inline" | "classes" | "structure", before: Record<string, string>, after: Record<string, string>) {
  return { id, label, source, rows: [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter(property => before[property] !== after[property])
    .map(property => ({ property, before: before[property] ?? "", after: after[property] ?? "" })) }
}

export function previewStyle(doc: EditorDocument, element: HTMLElement, patch: Record<string, string | undefined>, before: Record<string, string>, source: "inline" | "classes" = "inline") {
  const after = Object.fromEntries(Object.entries(patch).filter((entry): entry is [string, string] => entry[1] !== undefined))
  const id = element.dataset.adtId ?? ""
  return styleEntry(id, elementLabel(doc, id), source,
    Object.fromEntries(Object.keys(after).map(property => [property, before[property] ?? ""])), after)
}

export function snapshotStyles(element: HTMLElement) {
  const css = getComputedStyle(element)
  return { ...Object.fromEntries(Array.from(css).map(property => [property, css.getPropertyValue(property)])),
    ...declarations(element.getAttribute("style") ?? "") }
}
