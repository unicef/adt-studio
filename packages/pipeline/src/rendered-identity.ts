import { parseDocument, DomUtils } from "htmlparser2"

// Each rendered section is a separate document. Its DOM IDs, script selectors,
// ARIA references and activity keys are local; coincidentally equal tokens do
// not make them catalog identities. Only data-id belongs to the catalog.
export function rewriteRenderedIdentityReferences(html: string, ids: Map<string, string>): string {
  const doc = parseDocument(html)
  for (const element of DomUtils.findAll((element) => element.type === "tag", doc.children)) {
    // Custom sorting supports data-id as a legacy answer-key fallback. Make
    // that section-local key explicit before changing the catalog identity.
    const oldId = element.attribs["data-id"]
    if (oldId && ids.has(oldId) && element.attribs["data-correct-items"] !== undefined && element.attribs["data-activity-target"] === undefined) {
      element.attribs["data-activity-target"] = oldId
    }
    if (element.name !== "img" && oldId && ids.has(oldId)) element.attribs["data-id"] = ids.get(oldId)!
  }
  return DomUtils.getOuterHTML(doc)
}

/** Rewrite structured identity attributes, independent of HTML quote style.
 * Images retain their shared asset identity; cloned text and activity leaves
 * absent from the sectioning tree receive fresh identities as well. */
export function cloneRenderedIdentities(html: string, ids: Map<string, string>, allocate: () => string): string {
  const doc = parseDocument(html)
  const elements = DomUtils.findAll((element) => element.type === "tag", doc.children)
  for (const element of elements) {
    const id = element.attribs["data-id"]
    // Known source containers already have mappings. Extra HTML wrappers are
    // local aliases (legacy scripts select their root); only add missing leaves
    // that really enter the text catalog, not every attribute in the DOM.
    const hasIdentifiedChild = DomUtils.findOne(child => child.type === "tag" && child.attribs["data-id"] !== undefined, element.children, true)
    if (id && element.name !== "img" && !hasIdentifiedChild && !ids.has(id)) ids.set(id, allocate())
  }
  return rewriteRenderedIdentityReferences(html, ids)
}

/** Caller must have established the owner before changing it (clone/merge).
 * An ownerless legacy fragment receives a single wrapper covering all content. */
export function stampRenderedOwner(html: string, sectionId: string): string {
  const doc = parseDocument(html)
  const owners = DomUtils.findAll((element) => element.type === "tag" && element.attribs["data-section-id"] !== undefined, doc.children)
  if (owners.length > 1) throw new Error("Rendering has multiple section owners")
  if (!owners.length) return `<section data-section-id="${sectionId}">${html}</section>`
  owners[0].attribs["data-section-id"] = sectionId
  return DomUtils.getOuterHTML(doc)
}
