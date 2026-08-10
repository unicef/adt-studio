// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { reconstructHtmlWithEdit, serializeContentWrapper } from "./iframe-html"

// jsdom does not implement CSS.escape, which reconstructHtmlWithEdit relies on
// (present in real browsers / Electron). The fixtures use plain-identifier
// data-ids, so a faithful escape is enough to exercise the code path.
type WithCSS = { CSS?: { escape: (s: string) => string } }
if (typeof (globalThis as WithCSS).CSS === "undefined") {
  ;(globalThis as WithCSS).CSS = {
    escape: (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`),
  }
}

function wrapperFrom(html: string): Element {
  const doc = new DOMParser().parseFromString(html, "text/html")
  const el = doc.getElementById("content")
  if (!el) throw new Error("no #content in fixture")
  return el
}

// A trimmed-down version of what the fixed-layout renderer emits: a `#content`
// wrapper carrying `data-fl-reference-width` + inline pixel dimensions (but no
// `class`), with `[data-adt-fit]` paragraphs inside.
const FIXED_LAYOUT = `<div id="content" data-fl-reference-width="1440" style="position:relative;width:1440px;height:720px;margin:0 auto;overflow:hidden">
  <img data-id="im004" src="/x" style="position:absolute;top:0;left:0;width:720px;height:720px">
  <p data-id="p000" data-adt-fit="1" style="position:absolute;top:38px;left:172px"><span style="font-size:30.24px">Ishte garë</span></p>
</div>`

describe("serializeContentWrapper", () => {
  it("preserves a fixed-layout #content wrapper (no class) and re-adds the auto-fit script", () => {
    const html = serializeContentWrapper(wrapperFrom(FIXED_LAYOUT))
    // The outer container must survive — id, the reference width, and the
    // pixel dimensions are all required for correct scaling/positioning.
    expect(html).toContain('id="content"')
    expect(html).toContain('data-fl-reference-width="1440"')
    expect(html).toContain("width:1440px")
    expect(html).toContain('data-id="p000"')
    // The DOMPurify-stripped auto-fit <script> is restored inside the wrapper.
    expect(html).toContain('<script src="./assets/auto-fit.js"></script>')
    expect(html.match(/auto-fit\.js/g)?.length).toBe(1)
  })

  it("does not mutate the live wrapper when re-adding the script", () => {
    const wrapper = wrapperFrom(FIXED_LAYOUT)
    serializeContentWrapper(wrapper)
    // The script was appended to a detached clone, not the source node.
    expect(wrapper.querySelector('script[src*="auto-fit.js"]')).toBeNull()
  })

  it("does not duplicate the auto-fit script when one is already present", () => {
    const withScript = FIXED_LAYOUT.replace(
      "</div>",
      `<script src="./assets/auto-fit.js"></script></div>`
    )
    const html = serializeContentWrapper(wrapperFrom(withScript))
    expect(html.match(/auto-fit\.js/g)?.length).toBe(1)
  })

  it("preserves an images-only fixed-layout wrapper without adding a script", () => {
    const imagesOnly = `<div id="content" style="position:relative;width:800px;height:600px">
  <img data-id="im000" src="/x" style="position:absolute;top:0;left:0">
</div>`
    const html = serializeContentWrapper(wrapperFrom(imagesOnly))
    expect(html).toContain('id="content"')
    expect(html).toContain("width:800px")
    expect(html).not.toContain("auto-fit.js")
  })

  it("preserves a reflowable #content wrapper carrying a class (no script)", () => {
    const reflowable = `<div id="content" class="opacity-0"><section data-id="s1"><p data-id="p0">Hi</p></section></div>`
    const html = serializeContentWrapper(wrapperFrom(reflowable))
    expect(html).toContain('id="content"')
    expect(html).toContain('class="opacity-0"')
    expect(html).not.toContain("auto-fit.js")
  })

  it("drops a bare synthetic wrapper (only an id) and returns its inner content", () => {
    const bare = `<div id="content"><section data-id="s1"><p data-id="p0">Hi</p></section></div>`
    const html = serializeContentWrapper(wrapperFrom(bare))
    expect(html).not.toContain('id="content"')
    expect(html.trim()).toBe(`<section data-id="s1"><p data-id="p0">Hi</p></section>`)
  })
})

describe("reconstructHtmlWithEdit", () => {
  it("applies the edit and keeps the fixed-layout wrapper + auto-fit script", () => {
    const out = reconstructHtmlWithEdit(
      FIXED_LAYOUT,
      "p000",
      `<span style="font-size:30.24px">edited text</span>`
    )
    expect(out).not.toBeNull()
    expect(out).toContain('id="content"')
    expect(out).toContain('data-fl-reference-width="1440"')
    expect(out).toContain("edited text")
    expect(out).toContain('<script src="./assets/auto-fit.js"></script>')
  })

  it("returns the inner content for reflowable HTML without leaking the __root wrapper", () => {
    const out = reconstructHtmlWithEdit(
      `<section data-id="s1"><p data-id="p0">Hi</p></section>`,
      "p0",
      `Bye`
    )
    expect(out).not.toBeNull()
    expect(out).not.toContain("__root")
    expect(out).toContain("Bye")
    expect(out).toContain('data-id="s1"')
  })

  it("returns null when the data-id is not found", () => {
    expect(reconstructHtmlWithEdit(FIXED_LAYOUT, "missing", "x")).toBeNull()
  })
})
