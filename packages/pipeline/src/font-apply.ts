import { parseDocument, DomUtils } from "htmlparser2"

export type FontScope = "whole" | "heading" | "paragraph" | "body" | "caption"

const SCOPE_TAGS: Record<Exclude<FontScope, "whole">, ReadonlySet<string>> = {
  heading: new Set(["h1", "h2", "h3", "h4", "h5", "h6"]),
  paragraph: new Set(["p"]),
  body: new Set(["p", "li"]),
  caption: new Set(["figcaption"]),
}

function withoutFontFamily(style: string): string {
  return style
    .split(";")
    .map((decl) => decl.trim())
    .filter((decl) => decl.length > 0 && !/^font-family\s*:/i.test(decl))
    .join("; ")
}

function rewriteStyle(node: { attribs: Record<string, string> }, family: string | null): void {
  const current = node.attribs.style ?? ""
  const base = withoutFontFamily(current)
  const next = family ? (base ? `${base}; font-family: ${family}` : `font-family: ${family}`) : base
  if (next) node.attribs.style = next
  else delete node.attribs.style
}

export function applyFontToHtml(html: string, opts: { family: string | null; scope: FontScope }): string {
  const doc = parseDocument(html)
  const isWhole = opts.scope === "whole"
  const nodes = DomUtils.findAll((el) => {
    if (el.type !== "tag") return false
    if (isWhole) return true
    return SCOPE_TAGS[opts.scope as Exclude<FontScope, "whole">].has(el.name)
  }, doc.children)
  for (const node of nodes) {
    rewriteStyle(node, isWhole ? null : opts.family)
  }
  return DomUtils.getOuterHTML(doc)
}
