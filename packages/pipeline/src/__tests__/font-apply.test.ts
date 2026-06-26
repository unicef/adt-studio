import { describe, it, expect } from "vitest"
import { applyFontToHtml } from "../font-apply.js"

describe("applyFontToHtml", () => {
  it("removes every inline font-family for whole-book scope", () => {
    const html = `<section><h1 style="font-family:'Nabla',serif;color:red">T</h1><p style="font-family:'Lora',serif">b</p></section>`
    const out = applyFontToHtml(html, { family: "'Ignored',serif", scope: "whole" })
    expect(out).not.toContain("font-family")
    expect(out).toContain("color:red")
  })

  it("sets inline font-family only on headings for the heading scope", () => {
    const html = `<section><h2 data-id="t1">Title</h2><p data-id="t2">Body</p></section>`
    const out = applyFontToHtml(html, { family: "'Lexend',sans-serif", scope: "heading" })
    expect(out).toMatch(/<h2[^>]*font-family[^>]*Lexend/)
    expect(out).not.toMatch(/<p[^>]*font-family/)
  })

  it("replaces an existing inline font-family rather than appending a duplicate", () => {
    const html = `<p style="font-family:'Old',serif;font-size:12px">x</p>`
    const out = applyFontToHtml(html, { family: "'New',sans-serif", scope: "body" })
    expect(out).toContain("font-size:12px")
    expect(out).toContain("New")
    expect(out).not.toContain("Old")
    expect(out.match(/font-family/g)).toHaveLength(1)
  })

  it("sets inline font-family only on p elements for the paragraph scope", () => {
    const html = `<section><p data-id="p1">Body</p><ul><li>List item</li></ul><h2>Title</h2></section>`
    const out = applyFontToHtml(html, { family: "'Lora',serif", scope: "paragraph" })
    expect(out).toMatch(/<p[^>]*font-family[^>]*Lora/)
    expect(out).not.toMatch(/<li[^>]*font-family/)
    expect(out).not.toMatch(/<h2[^>]*font-family/)
  })

  it("resets a role to inherit the base when family is null", () => {
    const html = `<figure><figcaption style="font-family:'Cap',serif;font-style:italic">c</figcaption></figure>`
    const out = applyFontToHtml(html, { family: null, scope: "caption" })
    expect(out).not.toContain("font-family")
    expect(out).toContain("font-style:italic")
  })

  it("leaves elements outside the scope untouched", () => {
    const html = `<section><h1 style="font-family:'Keep',serif">T</h1><span>b</span></section>`
    const out = applyFontToHtml(html, { family: "'New',sans-serif", scope: "body" })
    expect(out).toMatch(/<h1[^>]*font-family[^>]*Keep/)
    expect(out).not.toContain("New")
  })
})
