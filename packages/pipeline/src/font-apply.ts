import { parseDocument, DomUtils } from "htmlparser2"
import { serializeHtml } from "./html-escape.js"

export type FontScope = "whole" | "heading" | "paragraph" | "body" | "caption"

const SCOPE_TAGS: Record<Exclude<FontScope, "whole">, ReadonlySet<string>> = {
  heading: new Set(["h1", "h2", "h3", "h4", "h5", "h6"]),
  paragraph: new Set(["p"]),
  body: new Set(["p", "li"]),
  caption: new Set(["figcaption"]),
}

/** Split a style attribute into its other declarations and its font-family values. */
function partitionStyle(style: string): { base: string; families: string[]; familyIsLast: boolean } {
  const decls = style.split(";").map((decl) => decl.trim()).filter((decl) => decl.length > 0)
  const isFamily = (decl: string) => /^font-family\s*:/i.test(decl)
  return {
    base: decls.filter((decl) => !isFamily(decl)).join("; "),
    families: decls.filter(isFamily).map((decl) => decl.replace(/^font-family\s*:\s*/i, "")),
    familyIsLast: decls.length > 0 && isFamily(decls[decls.length - 1]),
  }
}

/** Returns whether the element's font-family changed (other style formatting does not count). */
function rewriteStyle(node: { attribs: Record<string, string> }, family: string | null): boolean {
  const { base, families, familyIsLast } = partitionStyle(node.attribs.style ?? "")
  // The family must also come last, as this function writes it, so a later
  // `font:` shorthand cannot override it.
  const unchanged = family ? families.length === 1 && families[0] === family && familyIsLast : families.length === 0
  if (unchanged) return false
  const next = family ? (base ? `${base}; font-family: ${family}` : `font-family: ${family}`) : base
  if (next) node.attribs.style = next
  else delete node.attribs.style
  return true
}

export function applyFontToHtml(html: string, opts: { family: string | null; scope: FontScope }): string {
  const doc = parseDocument(html)
  const isWhole = opts.scope === "whole"
  const nodes = DomUtils.findAll((el) => {
    if (el.type !== "tag") return false
    if (isWhole) return true
    return SCOPE_TAGS[opts.scope as Exclude<FontScope, "whole">].has(el.name)
  }, doc.children)
  let changed = false
  for (const node of nodes) {
    if (rewriteStyle(node, isWhole ? null : opts.family)) changed = true
  }
  // Unchanged input is returned as-is: re-serializing older stored HTML would
  // differ only in entity encoding (#907), and callers save a new rendering
  // version whenever the string differs.
  return changed ? serializeHtml(doc) : html
}
