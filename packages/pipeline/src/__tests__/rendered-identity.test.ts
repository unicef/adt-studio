import { DomUtils, parseDocument } from "htmlparser2"
import { expect, it } from "vitest"
import { cloneRenderedIdentities } from "../rendered-identity.js"

it.each(["", "   "])("clones a malformed legacy text identity %j consistently with its source mapping", id => {
  const mapping = new Map([[id, "fresh-source"]])
  const html = `<section><p data-id="${id}">Legacy text</p><img data-id="${id}" src="shared.png"/></section>`
  const cloned = parseDocument(cloneRenderedIdentities(html, mapping, () => { throw new Error("The source identity already has a mapping") }))
  const elements = DomUtils.findAll(element => element.type === "tag", cloned.children)
  expect(elements.find(element => element.name === "p")?.attribs["data-id"]).toBe("fresh-source")
  expect(elements.find(element => element.name === "img")?.attribs["data-id"]).toBe(id)
  expect(DomUtils.textContent(cloned)).toBe("Legacy text")
})

it("allocates a fresh identity for an empty-ID legacy leaf absent from the source tree", () => {
  const mapping = new Map<string, string>()
  const cloned = parseDocument(cloneRenderedIdentities('<section id="local-root"><p data-id>Legacy text</p><script>document.getElementById("local-root")</script></section>', mapping, () => "fresh-leaf"))
  const elements = DomUtils.findAll(element => element.type === "tag", cloned.children)
  expect(elements.find(element => element.name === "p")?.attribs["data-id"]).toBe("fresh-leaf")
  expect(elements.find(element => element.name === "section")?.attribs.id).toBe("local-root")
  expect(DomUtils.textContent(DomUtils.getElementsByTagName("script", cloned.children)[0])).toBe('document.getElementById("local-root")')
  expect(mapping.get("")).toBe("fresh-leaf")
})
