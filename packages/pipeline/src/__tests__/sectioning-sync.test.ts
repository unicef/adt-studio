import { describe, expect, it, vi } from "vitest"
import { JSDOM } from "jsdom"
import type { PageSectioningSection, SectioningSyncInput } from "@adt/types"
import { classifySectioningSynchronization as classify } from "../sectioning-sync.js"

const sectionId = "pg001_sec007"
function section(text = "Old & safe"): PageSectioningSection {
  return { sectionId, sectionType: "text", backgroundColor: "#fff", textColor: "#000", pageNumber: 1, isPruned: false, nodes: [
    { nodeId: "text-1", role: "text", text, isPruned: false },
  ] }
}
function fixture(html = `<section data-section-id='${sectionId}' data-section-type='text'><p class='keep  spacing' data-id='text-1'>Old &amp; safe</p></section>`): SectioningSyncInput {
  return {
    pageId: "pg001", sourceVersion: 2, renderingVersion: 4, layout: "reflowable",
    source: { reasoning: "new", sections: [section("New <img src=x onerror=alert(1)>")] },
    priorSource: { reasoning: "before", sections: [section()] },
    rendering: { sections: [{ sectionIndex: 99, sectionType: "text", reasoning: "rendered", html }] },
    sectionOwners: { [sectionId]: ["pg001"] },
    proofs: [{ sectionId, pageId: "pg001", sourceVersion: 2, renderingVersion: 4, origin: "generated" }],
  }
}
function assertRetained(input: SectioningSyncInput, status: string) {
  const copy = structuredClone(input)
  const result = classify(input)
  expect(result.sections[0].status).toBe(status)
  expect(result.changed).toBe(false)
  expect(result.rendering).toBe(input.rendering)
  expect(input).toEqual(copy)
  return result
}

describe("Sectioning synchronization classifier (SPEC-0012)", () => {
  it.each(["image", "container"])("retains changed text without a supported text projection on a %s node", (kind) => {
    const input = fixture()
    for (const tree of [input.source, input.priorSource!]) {
      tree.sections[0].nodes.push({ nodeId: "non-text", isPruned: false,
        ...(kind === "image" ? { role: "image" } : { structure: "group", children: [] }),
        text: tree === input.source ? "Changed description" : "Original description",
      })
    }
    input.rendering!.sections[0].html = input.rendering!.sections[0].html.replace("</section>",
      (kind === "image" ? '<img data-id="non-text" src="keep.png" alt="Original description">' : '<div data-id="non-text">Original description</div>') + "</section>")
    assertRetained(input, "structural-drift")
  })

  it("patches only escaped text bytes without provider/network access or input mutation", () => {
    const input = fixture()
    const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("No provider calls allowed"))
    try {
      const original = structuredClone(input)
      const result = classify(input)
      expect(result.changed).toBe(true)
      expect(result.sections[0].status).toBe("text-patched")
      expect(result.rendering!.sections[0].html).toBe(input.rendering!.sections[0].html.replace("Old &amp; safe", "New &lt;img src=x onerror=alert(1)&gt;"))
      expect(input).toEqual(original)
      expect(fetch).not.toHaveBeenCalled()
    } finally { fetch.mockRestore() }
  })

  it("is a no-op for the same committed source/render pair", () => {
    const input = fixture()
    const first = classify(input)
    input.rendering = first.rendering
    input.priorSource = structuredClone(input.source)
    assertRetained(input, "current")
  })

  it("preserves images, scripts, layout, and an unrelated sparse/reordered rendering byte for byte", () => {
    const input = fixture()
    const untouched = { sectionIndex: 0, sectionType: "text", reasoning: "other", html: "<section data-section-id='pg001_sec002' data-section-type='text'><p data-id='t2'>Other</p></section>" }
    input.rendering!.sections.unshift(untouched)
    const other = { ...section("Other"), sectionId: "pg001_sec002", nodes: [{ nodeId: "t2", role: "text", text: "Other", isPruned: false }] }
    input.source.sections.push(other)
    input.priorSource!.sections.push(other)
    input.sectionOwners[other.sectionId] = [input.pageId]
    input.proofs.push({ ...input.proofs[0], sectionId: other.sectionId })
    const extras = '<img data-id="img-1" src="../images/a.png?v=2&amp;x=3"><script>const x = "<tag>";</script><span data-id="activity_gen_1">Keep</span>'
    input.rendering!.sections[1].html = input.rendering!.sections[1].html.replace("</section>", extras + "</section>")
    for (const tree of [input.source, input.priorSource!]) tree.sections[0].nodes.push({ nodeId: "img-1", role: "image", isPruned: false })
    const result = classify(input)
    expect(result.rendering!.sections[0]).toBe(untouched)
    expect(result.rendering!.sections[1].html).toBe(input.rendering!.sections[1].html.replace("Old &amp; safe", "New &lt;img src=x onerror=alert(1)&gt;"))
    expect(result.sections.map((s) => [s.sectionId, s.status])).toEqual([[sectionId, "text-patched"], [other.sectionId, "current"]])
  })

  it("preserves nested containers and omitted optional text", () => {
    const input = fixture()
    for (const tree of [input.source, input.priorSource!]) {
      tree.sections[0].nodes = [{ nodeId: "group", structure: "group", isPruned: false, children: tree.sections[0].nodes }, { nodeId: "foot", role: "footer", text: "1", isPruned: false }]
    }
    input.rendering!.sections[0].html = input.rendering!.sections[0].html.replace("<p ", '<div data-id="group"><p ').replace("</p>", "</p></div>")
    expect(classify(input).sections[0].status).toBe("text-patched")
  })

  it("preserves blank markers and hints through an exact placeholder mapping", () => {
    const input = fixture(`<section data-section-id='${sectionId}' data-section-type='text'><p data-id='text-1'>Pick [[blank:item-1:hint]] &amp; [[blank:item-2]]</p></section>`)
    input.priorSource!.sections[0].nodes[0].text = "Pick ___ & [placeholder:word]"
    input.source.sections[0].nodes[0].text = "Choose ___ & [placeholder:word]"
    const result = classify(input)
    expect(result.sections[0].status).toBe("text-patched")
    expect(result.rendering!.sections[0].html).toBe(input.rendering!.sections[0].html.replace("Pick", "Choose"))
  })

  it.each(["added", "removed", "pruned", "role", "membership", "heading", "image"])("retains HTML after a %s structure change", (change) => {
    const input = fixture()
    const target = input.source.sections[0]
    if (change === "added") target.nodes.push({ nodeId: "n2", role: "text", text: "More", isPruned: false })
    if (change === "removed") target.nodes = []
    if (change === "pruned") target.nodes[0].isPruned = true
    if (change === "role") target.nodes[0].role = "heading"
    if (change === "membership") target.sourcePageIds = ["pg002"]
    if (change === "heading") target.nodes[0].headingLevel = 2
    if (change === "image") target.nodes.push({ nodeId: "image2", role: "image", isPruned: false })
    assertRetained(input, "structural-drift")
  })

  it.each([
    ["manual text", `<p data-id='text-1'>Manual correction</p>`, "protected-divergence"],
    ["nested custom text", `<p data-id='text-1'><em>Old &amp; safe</em></p>`, "structural-drift"],
    ["missing text", `<p>Old &amp; safe</p>`, "structural-drift"],
    ["duplicate text identity", `<p data-id='text-1'>Old &amp; safe</p><p data-id='text-1'>Old &amp; safe</p>`, "invalid-rendering"],
    ["unmatched image", `<p data-id='text-1'>Old &amp; safe</p><img data-id='unknown'>`, "structural-drift"],
  ])("preserves %s", (_, body, status) => {
    assertRetained(fixture(`<section data-section-id='${sectionId}' data-section-type='text'>${body}</section>`), status)
  })

  it.each(["<div>legacy</div>", "<section><p data-id='text-1'>Old &amp; safe</p></section>"])("never maps identityless legacy HTML by index", (html) => {
    const input = fixture(html)
    input.rendering!.sections[0].sectionIndex = 0
    assertRetained(input, "unknown-origin")
  })

  it.each(["none", "wrong-version", "wrong-source-version", "wrong-page", "unknown", "duplicate"])("requires trusted proof (%s)", (kind) => {
    const input = fixture()
    if (kind === "none") input.proofs = []
    if (kind === "wrong-version") input.proofs[0].renderingVersion = 3
    if (kind === "wrong-source-version") input.proofs[0].sourceVersion = 1
    if (kind === "wrong-page") input.proofs[0].pageId = "pg002"
    if (kind === "unknown") input.proofs[0].origin = "unknown"
    if (kind === "duplicate") input.proofs.push({ ...input.proofs[0] })
    assertRetained(input, "unknown-origin")
  })

  it("does not infer generated provenance from equal text", () => {
    const input = fixture()
    input.source = structuredClone(input.priorSource!)
    input.proofs = []
    assertRetained(input, "unknown-origin")
  })

  it("protects explicit manual origin even when its text matches", () => {
    const input = fixture()
    input.proofs[0].origin = "manual"
    assertRetained(input, "protected-divergence")
  })

  it.each([["pg002"], ["pg001", "pg002"], []])("requires unique active graph ownership %j", (...owners) => {
    const input = fixture()
    input.sectionOwners[sectionId] = owners as string[]
    assertRetained(input, "unknown-origin")
  })

  it("reports missing and malformed output without discarding it", () => {
    const missing = fixture()
    missing.rendering = null
    assertRetained(missing, "invalid-rendering")
    const malformed = fixture(`<section data-section-id='${sectionId}'><p data-id='text-1'>Old`)
    assertRetained(malformed, "invalid-rendering")
    const duplicate = fixture()
    duplicate.rendering!.sections.push({ ...duplicate.rendering!.sections[0] })
    assertRetained(duplicate, "invalid-rendering")
  })

  it("never redirects a retired rendering to the successor occupying its old index", () => {
    const input = fixture()
    input.source.sections[0].sectionId = "pg001_sec008"
    input.sectionOwners.pg001_sec008 = ["pg001"]
    input.rendering!.sections[0].sectionIndex = 0
    const result = classify(input)
    expect(result.sections.map((s) => [s.sectionId, s.status])).toEqual([["pg001_sec008", "invalid-rendering"], [sectionId, "structural-drift"]])
    expect(result.rendering).toBe(input.rendering)
  })

  it("explains fixed layout without proposing a semantic patch", () => {
    const input = fixture()
    input.layout = "fixed"
    assertRetained(input, "fixed-layout-unmapped")
  })
})

describe("conservative projection boundaries", () => {
  it.each([
    "carriage\rreturn", "windows\r\nline", "line\nfeed", "tab\there", "quotes '\" & < >",
    "literal &#13; &notit;", "العربية 中文 e\u0301 👩🏽‍🚀", "\u00a0nonbreaking\u2028separator", "",
  ])("round-trips replacement text through a browser HTML parser: %j", (text) => {
    const input = fixture()
    input.source.sections[0].nodes[0].text = text
    const result = classify(input)
    expect(result.sections[0].status).toBe("text-patched")
    const dom = new JSDOM(result.rendering!.sections[0].html)
    try {
      const target = dom.window.document.querySelector('[data-id="text-1"]')!
      expect(target.textContent).toBe(text)
      expect(target.children).toHaveLength(0)
    } finally { dom.window.close() }
    assertRetained({ ...input, rendering: result.rendering, priorSource: structuredClone(input.source) }, "current")
  })

  it("updates an empty leaf without changing its opening or closing tag bytes", () => {
    const html = `<section data-section-id='${sectionId}' data-section-type='text'><p class='keep' data-id='text-1'></P  ></section>`
    const input = fixture(html)
    input.priorSource!.sections[0].nodes[0].text = ""
    input.source.sections[0].nodes[0].text = "New & text"
    const result = classify(input)
    expect(result.sections[0].status).toBe("text-patched")
    expect(result.rendering!.sections[0].html).toBe(html.replace("</P  >", "New &amp; text</P  >"))
  })

  it("retains source characters that cannot be represented losslessly in HTML", () => {
    const input = fixture()
    input.source.sections[0].nodes[0].text = "nul\u0000byte"
    assertRetained(input, "structural-drift")
  })

  it.each(["high\ud800surrogate", "low\udc00surrogate"])("retains text that would be corrupted by HTML UTF-8 serialization: %j", (text) => {
    const input = fixture()
    input.source.sections[0].nodes[0].text = text
    expect(Buffer.from(text, "utf8").toString("utf8")).not.toBe(text)
    assertRetained(input, "structural-drift")
  })

  it.each(["template", "noscript", "select", "svg", "math"])("retains unsupported %s parsing contexts", (tag) => {
    const input = fixture(`<section data-section-id='${sectionId}' data-section-type='text'><${tag}><p data-id='text-1'>Old &amp; safe</p></${tag}></section>`)
    assertRetained(input, "structural-drift")
  })

  it("also checks parsing contexts outside the section wrapper", () => {
    const input = fixture()
    input.rendering!.sections[0].html = `<template>${input.rendering!.sections[0].html}</template>`
    assertRetained(input, "structural-drift")
  })

  it("retains ambiguous reused blank identities even when their hints differ", () => {
    const input = fixture(`<section data-section-id='${sectionId}' data-section-type='text'><p data-id='text-1'>Pick [[blank:item-1:first]] &amp; [[blank:item-1:second]]</p></section>`)
    input.priorSource!.sections[0].nodes[0].text = "Pick ___ & [placeholder:word]"
    input.source.sections[0].nodes[0].text = "Choose ___ & [placeholder:word]"
    assertRetained(input, "protected-divergence")
  })

  it("does not return a partial section patch if a later leaf diverged manually", () => {
    const input = fixture()
    for (const tree of [input.source, input.priorSource!]) tree.sections[0].nodes.push({ nodeId: "second", role: "text", text: "Source", isPruned: false })
    input.rendering!.sections[0].html = input.rendering!.sections[0].html.replace("</section>", "<p data-id='second'>Manual</p></section>")
    assertRetained(input, "protected-divergence")
  })

  it("rejects ambiguous attributes and never replaces raw script content", () => {
    const duplicate = fixture()
    duplicate.rendering!.sections[0].html = duplicate.rendering!.sections[0].html.replace("data-id='text-1'", "data-id='text-1' data-id='other'")
    assertRetained(duplicate, "invalid-rendering")
    const script = fixture(`<section data-section-id='${sectionId}' data-section-type='text'><script data-id='text-1'>Old & safe</script></section>`)
    assertRetained(script, "structural-drift")
  })

  it("does not invent a missing rendering for an empty section the renderer skips", () => {
    const input = fixture()
    input.source.sections[0].nodes = []
    input.rendering = null
    input.proofs = []
    assertRetained(input, "current")
  })

  it("preserves unmatched images even when they have no data-id", () => {
    const input = fixture()
    input.rendering!.sections[0].html = input.rendering!.sections[0].html.replace("</section>", "<img src='custom.png'></section>")
    assertRetained(input, "structural-drift")
  })
})
