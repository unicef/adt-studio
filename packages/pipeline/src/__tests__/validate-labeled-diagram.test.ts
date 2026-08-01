import { describe, expect, it } from "vitest"
import { validateLabeledDiagrams } from "../validate-labeled-diagram.js"
import type { RenderNode } from "../web-rendering.js"

const nodes: RenderNode[] = [{
  node_id: "diagram",
  structure: "image_group",
  children: [
    { node_id: "image-node", role: "image", image_id: "digestive-system" },
    { node_id: "mouth", role: "label", text: "Mouth" },
    { node_id: "stomach", role: "label", text: "Stomach" },
    { node_id: "caption", role: "caption", text: "The digestive system" },
  ],
}]

describe("validateLabeledDiagrams", () => {
  it("accepts visible labels with semantic image metadata", () => {
    const html = `<section><figure><img data-id="digestive-system" alt="The digestive system"><span data-id="mouth">Mouth</span><span data-id="stomach">Stomach</span><figcaption data-id="caption">The digestive system</figcaption></figure></section>`
    expect(validateLabeledDiagrams(html, nodes)).toEqual([])
  })

  it("rejects labels hidden from sighted learners and empty alt text", () => {
    const html = `<section><figure><img data-id="digestive-system" alt=""><div class="sr-only"><span data-id="mouth">Mouth</span><span data-id="stomach">Stomach</span></div><figcaption data-id="caption">The digestive system</figcaption></figure></section>`
    expect(validateLabeledDiagrams(html, nodes)).toEqual(expect.arrayContaining([
      expect.stringContaining("non-empty alt text"),
      expect.stringContaining('"mouth" must be visibly rendered'),
      expect.stringContaining('"stomach" must be visibly rendered'),
    ]))
  })

  it("requires one semantic figure and figcaption association", () => {
    const html = `<section><img data-id="digestive-system" alt="The digestive system"><span data-id="mouth">Mouth</span><span data-id="stomach">Stomach</span><p data-id="caption">The digestive system</p></section>`
    expect(validateLabeledDiagrams(html, nodes)).toEqual(expect.arrayContaining([
      expect.stringContaining("semantic <figure>"),
      expect.stringContaining("semantic <figcaption>"),
    ]))
  })
})
