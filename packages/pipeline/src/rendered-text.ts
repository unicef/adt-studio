import { DomUtils, parseDocument } from "htmlparser2"

/** The text sent to source generators. Styling and executable content cannot
 * turn a cosmetic save into new generator input. Never read media assets. */
export function renderedText(html: string): string {
  const doc = parseDocument(html)
  for (const element of DomUtils.findAll(element => ["style", "script", "head"].includes(element.name), doc.children)) {
    DomUtils.removeElement(element)
  }
  return DomUtils.textContent(doc).replace(/\s+/g, " ").trim()
}
