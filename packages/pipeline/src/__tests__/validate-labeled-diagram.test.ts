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

  it("rejects disconnected rules and leaders without accessible endpoints", () => {
    const html = `<section><figure><img data-id="digestive-system" alt="The digestive system"><span data-id="mouth">Mouth</span><span class="h-px w-12"></span><span data-id="stomach">Stomach</span><svg><line x1="0" y1="0" x2="10" y2="10"/></svg><figcaption data-id="caption">The digestive system</figcaption></figure></section>`
    expect(validateLabeledDiagrams(html, nodes)).toEqual(expect.arrayContaining([
      expect.stringContaining("disconnected HTML rules"),
      expect.stringContaining('"mouth" must link to a focusable'),
      expect.stringContaining('"stomach" must link to a focusable'),
    ]))
  })

  it("accepts SVG leaders explicitly connecting named label and feature endpoints", () => {
    const html = `<section><figure><img data-id="digestive-system" alt="The digestive system"><ul><li data-diagram-callout class="flex gap-0"><a id="mouth-label" href="#mouth-target" class="bg-white"><span data-id="mouth">Mouth</span></a><svg viewBox="0 0 20 20"><line data-label-id="mouth" data-label-contact="start" aria-labelledby="mouth-label mouth-target" x1="0" y1="0" x2="10" y2="10"/><circle id="mouth-target" tabindex="0" aria-label="Mouth" cx="10" cy="10"/></svg></li><li data-diagram-callout class="flex gap-0"><svg viewBox="0 0 20 20"><polyline data-label-id="stomach" data-label-contact="end" aria-labelledby="stomach-label stomach-target" points="10,15 15,10 20,5"/><circle id="stomach-target" tabindex="0" aria-label="Stomach" cx="10" cy="15"/></svg><a id="stomach-label" href="#stomach-target" class="bg-white"><span data-id="stomach">Stomach</span></a></li></ul><figcaption data-id="caption">The digestive system</figcaption></figure></section>`
    expect(validateLabeledDiagrams(html, nodes)).toEqual([])
  })

  it("accepts labels and leaders sharing one preserved SVG coordinate system", () => {
    const html = `<section><figure><svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet"><foreignObject x="25" y="0" width="50" height="100"><img data-id="digestive-system" alt="The digestive system"></foreignObject><a id="mouth-label" href="#mouth-target"><text data-id="mouth" x="0" y="20" paint-order="stroke" stroke="white" stroke-width="3">Mouth</text></a><line data-label-id="mouth" data-label-contact="start" aria-labelledby="mouth-label mouth-target" x1="20" y1="20" x2="40" y2="25"/><circle id="mouth-target" tabindex="0" aria-label="Mouth" cx="40" cy="25"/><a id="stomach-label" href="#stomach-target"><text data-id="stomach" x="80" y="60" paint-order="stroke" stroke="white" stroke-width="3">Stomach</text></a><line data-label-id="stomach" data-label-contact="end" aria-labelledby="stomach-label stomach-target" x1="60" y1="55" x2="80" y2="60"/><circle id="stomach-target" tabindex="0" aria-label="Stomach" cx="60" cy="55"/></svg><figcaption data-id="caption">The digestive system</figcaption></figure></section>`
    expect(validateLabeledDiagrams(html, nodes)).toEqual([])
  })

  it("rejects leaders that are not associated with the label side or miss the feature marker", () => {
    const html = `<section><figure><img data-id="digestive-system" alt="The digestive system"><a id="mouth-label" href="#mouth-target"><span data-id="mouth">Mouth</span></a><a id="stomach-label" href="#stomach-target"><span data-id="stomach">Stomach</span></a><svg><line data-label-id="mouth" x1="0" y1="0" x2="8" y2="8"/><circle id="mouth-target" tabindex="0" aria-label="Mouth" cx="10" cy="10"/><line data-label-id="stomach" data-label-contact="start" aria-labelledby="stomach-label stomach-target" x1="0" y1="5" x2="8" y2="12"/><circle id="stomach-target" tabindex="0" aria-label="Stomach" cx="10" cy="15"/></svg><figcaption data-id="caption">The digestive system</figcaption></figure></section>`
    expect(validateLabeledDiagrams(html, nodes)).toEqual(expect.arrayContaining([
      expect.stringContaining('label "mouth" must have an opaque background'),
      expect.stringContaining('label "mouth" and its leader must share one zero-gap'),
      expect.stringContaining('leader for "mouth" must identify its label-side contact'),
      expect.stringContaining('leader for "mouth" must meet its label at the inline SVG boundary'),
      expect.stringContaining('leader for "mouth" must terminate exactly'),
      expect.stringContaining('leader for "stomach" must terminate exactly'),
    ]))
  })

  it("rejects distorted leader coordinates and mismatched marker names", () => {
    const html = `<section><figure><img data-id="digestive-system" alt="The digestive system"><ul><li data-diagram-callout class="flex gap-0"><a id="mouth-label" href="#mouth-target" class="bg-white"><span data-id="mouth">Mouth</span></a><svg viewBox="0 0 20 20" preserveAspectRatio="none"><line data-label-id="mouth" data-label-contact="start" aria-labelledby="mouth-label mouth-target" x1="0" y1="0" x2="10" y2="10"/><circle id="mouth-target" tabindex="0" aria-label="Stomach" cx="10" cy="10"/></svg></li><li data-diagram-callout class="flex gap-0"><svg viewBox="0 0 20 20"><line data-label-id="stomach" data-label-contact="end" aria-labelledby="stomach-label stomach-target" x1="10" y1="10" x2="20" y2="0"/><circle id="stomach-target" tabindex="0" aria-label="Stomach" cx="10" cy="10"/></svg><a id="stomach-label" href="#stomach-target" class="bg-white"><span data-id="stomach">Stomach</span></a></li></ul><figcaption data-id="caption">The digestive system</figcaption></figure></section>`
    expect(validateLabeledDiagrams(html, nodes)).toEqual(expect.arrayContaining([
      expect.stringContaining("must preserve their SVG aspect ratio"),
      expect.stringContaining('label "mouth" must link to a marker named exactly "Mouth"'),
    ]))
  })
})
