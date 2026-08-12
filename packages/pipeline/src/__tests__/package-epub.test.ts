import { describe, it, expect } from "vitest"
import { mirrorDataIdToId, wrapWordSpans, buildNavDocument } from "../packaging/epub.js"
import type { PageEntry } from "../packaging/web.js"

describe("buildNavDocument", () => {
  const pages: PageEntry[] = [
    { section_id: "pg002_sec001", href: "pg002_sec001.xhtml", page_number: 2 },
    { section_id: "pg001_sec001", href: "pg001_sec001.xhtml", page_number: 1 },
  ]

  it("orders a stored TOC by reading position, not by the order it was stored in", () => {
    // The spine and the NCX in the same package are built from `pageList`. The
    // stored `toc-generation` node is not — it keeps the order the LLM emitted
    // and a reorder never rewrites it — so without sorting, one EPUB would ship
    // a nav that disagreed with its own spine.
    const nav = buildNavDocument("en", "Book", pages, {
      generatedAt: "2026-01-01T00:00:00.000Z",
      pageCount: 2,
      entries: [
        { id: "t1", title: "Alpha", sectionId: "pg001_sec001", href: "x", chapterId: "c1", level: 1 },
        { id: "t2", title: "Beta", sectionId: "pg002_sec001", href: "x", chapterId: "c2", level: 1 },
      ],
    })

    // pg002 is first in the reading order, so "Beta" leads.
    expect(nav.indexOf("Beta")).toBeLessThan(nav.indexOf("Alpha"))
  })

  it("keeps an entry whose section is not in the book at the end rather than dropping it silently", () => {
    const nav = buildNavDocument("en", "Book", pages, {
      generatedAt: "2026-01-01T00:00:00.000Z",
      pageCount: 2,
      entries: [
        { id: "t0", title: "Ghost", sectionId: "pg009_sec001", href: "x", chapterId: "c0", level: 1 },
        { id: "t2", title: "Beta", sectionId: "pg002_sec001", href: "x", chapterId: "c2", level: 1 },
      ],
    })

    // The ghost has no href to resolve, so it renders as nothing at all — but
    // it must not have displaced a real entry on the way there.
    expect(nav).toContain("Beta")
    expect(nav).not.toContain("Ghost")
  })
})

describe("mirrorDataIdToId", () => {
  it("adds id= matching data-id when id is absent", () => {
    const xhtml = `<h1 data-id="pg002_n0002" class="x">title</h1>`
    expect(mirrorDataIdToId(xhtml)).toBe(
      `<h1 data-id="pg002_n0002" class="x" id="pg002_n0002">title</h1>`,
    )
  })

  it("leaves existing id attributes untouched", () => {
    const xhtml = `<h1 id="page-heading" data-id="pg001_n0001">title</h1>`
    expect(mirrorDataIdToId(xhtml)).toBe(xhtml)
  })

  it("ignores elements without data-id", () => {
    const xhtml = `<p class="x">no anchor</p>`
    expect(mirrorDataIdToId(xhtml)).toBe(xhtml)
  })

  it("does not touch word spans that already carry an id", () => {
    // Fixed-layout renderer emits per-word spans like `<span id="…_w001">`
    // (no data-id). They must be left alone.
    const xhtml = `<span id="pg001_n0001_w001">Hello</span>`
    expect(mirrorDataIdToId(xhtml)).toBe(xhtml)
  })

  it("handles multiple elements in one document", () => {
    const xhtml = `<p data-id="a">A</p><p data-id="b">B</p>`
    expect(mirrorDataIdToId(xhtml)).toBe(
      `<p data-id="a" id="a">A</p><p data-id="b" id="b">B</p>`,
    )
  })

  it("works on self-closing void elements (img/br)", () => {
    const xhtml = `<img data-id="pg001_im001" src="x.png"/>`
    expect(mirrorDataIdToId(xhtml)).toBe(
      `<img data-id="pg001_im001" src="x.png" id="pg001_im001"/>`,
    )
  })

  it("does not mistake id-suffixed attribute names for the id attribute", () => {
    // Defensive: an attribute like `data-id="x"` already contains the
    // substring `id=`. The regex must only match the standalone `id=` attr.
    const xhtml = `<p data-id="pg002_n0002">title</p>`
    expect(mirrorDataIdToId(xhtml)).toBe(
      `<p data-id="pg002_n0002" id="pg002_n0002">title</p>`,
    )
  })
})

describe("wrapWordSpans", () => {
  it("wraps each word inside [data-id] elements in <span id>", () => {
    const html = `<html><body><p data-id="pg002_n0002">Hello world.</p></body></html>`
    const out = wrapWordSpans(html)
    expect(out).toContain(`<span id="pg002_n0002_w001">Hello</span>`)
    expect(out).toContain(`<span id="pg002_n0002_w002">world</span>`)
    // Trailing punctuation stays outside the word span.
    expect(out).toContain(`</span>.</p>`)
  })

  it("preserves inline elements while wrapping the text they contain", () => {
    const html =
      `<html><body><p data-id="pg002_n0002">She walks <em>tall</em> and proud.</p></body></html>`
    const out = wrapWordSpans(html)
    expect(out).toContain(`<span id="pg002_n0002_w001">She</span>`)
    expect(out).toContain(`<span id="pg002_n0002_w002">walks</span>`)
    // The <em> wrapper is kept; the word inside gets its own id.
    expect(out).toContain(`<em><span id="pg002_n0002_w003">tall</span></em>`)
    expect(out).toContain(`<span id="pg002_n0002_w004">and</span>`)
    expect(out).toContain(`<span id="pg002_n0002_w005">proud</span>`)
  })

  it("skips img[data-id] — image audio is not in the overlay pipeline", () => {
    const html = `<html><body><img data-id="pg001_im001" src="x.png"></body></html>`
    const out = wrapWordSpans(html)
    expect(out).not.toContain(`pg001_im001_w`)
  })

  it("re-emits fixed-layout paragraphs from data-segments with word spans wrapping style runs", () => {
    // The renderer emits a structural shell (styled segments, no word ids).
    // Packaging consumes data-segments to wrap words, including the
    // cross-style-run "lahars" case — one word span around two styled
    // fragments.
    const segments = [
      { text: "the la", style: { color: "#000000" } },
      { text: "h", style: { color: "#ffffff" } },
      { text: "ars came", style: { color: "#000000" } },
    ]
    const dataSegments = JSON.stringify(segments).replace(/"/g, "&quot;")
    const html =
      `<html><body><p data-id="pg001_p000" data-segments="${dataSegments}">` +
      `<span style="color:#000000">the la</span>` +
      `<span style="color:#ffffff">h</span>` +
      `<span style="color:#000000">ars came</span>` +
      `</p></body></html>`
    const out = wrapWordSpans(html)
    expect(out).toContain(`<span id="pg001_p000_w001">`)
    expect(out).toContain(`<span id="pg001_p000_w002">`)
    expect(out).toContain(`<span id="pg001_p000_w003">`)
    expect(out).not.toContain(`pg001_p000_w004`)
    // "lahars" (w002) wraps three styled fragments straddling the runs.
    expect(out).toMatch(
      /<span id="pg001_p000_w002"><span style="color:#000000">la<\/span><span style="color:#ffffff">h<\/span><span style="color:#000000">ars<\/span><\/span>/,
    )
  })

  it("sizes each word wrapper to its largest segment font-size so the read-aloud highlight covers the word", () => {
    // The media-overlay active class paints the word wrapper's own inline
    // background box, whose height follows the wrapper's font-size. In
    // fixed-layout the size lives only on the inner styled spans, so an
    // unsized wrapper would inherit the ~16px page default and highlight a
    // thin sliver behind a 48px word. The wrapper must mirror the word's
    // size — the largest segment size when a word straddles two sizes.
    const segments = [
      { text: "big ", style: { "font-size": "48px", color: "#000000" } },
      // "wo|rd" straddles a 24px → 48px style boundary; the wrapper takes 48.
      { text: "wo", style: { "font-size": "24px", color: "#000000" } },
      { text: "rd", style: { "font-size": "48px", color: "#000000" } },
    ]
    const dataSegments = JSON.stringify(segments).replace(/"/g, "&quot;")
    const html =
      `<html><body><p data-id="pg001_p000" data-segments="${dataSegments}">` +
      `<span style="font-size:48px;color:#000000">big </span>` +
      `<span style="font-size:24px;color:#000000">wo</span>` +
      `<span style="font-size:48px;color:#000000">rd</span>` +
      `</p></body></html>`
    const out = wrapWordSpans(html)
    // Single-size word takes that size.
    expect(out).toContain(`<span id="pg001_p000_w001" style="font-size:48px">`)
    // Straddling word takes the largest of its two segment sizes.
    expect(out).toContain(`<span id="pg001_p000_w002" style="font-size:48px">`)
  })

  it("styles inter-word separators with the surrounding segment so spaces keep the display font-size", () => {
    // Regression: in fixed-layout the font-size lives only on the per-segment
    // span and the <p> has none, so a bare-text-node space inherits the page
    // default (~16px) and a gap between two 48px words renders ~4px wide —
    // the words look unspaced. The separator must be wrapped in a span
    // carrying the segment style.
    const segments = [
      { text: "I am", style: { "font-size": "48px", color: "#000000" } },
    ]
    const dataSegments = JSON.stringify(segments).replace(/"/g, "&quot;")
    const html =
      `<html><body><p data-id="pg001_p000" data-segments="${dataSegments}">` +
      `<span style="font-size:48px;color:#000000">I am</span>` +
      `</p></body></html>`
    const out = wrapWordSpans(html)
    // The space between the two words is wrapped in a font-sized span, not a
    // bare text node directly under <p>. The word wrappers also carry the
    // word's font-size so the media-overlay highlight box covers the glyphs.
    expect(out).toMatch(
      /<span id="pg001_p000_w001" style="font-size:48px"><span style="font-size:48px;color:#000000">I<\/span><\/span><span style="font-size:48px;color:#000000"> <\/span><span id="pg001_p000_w002" style="font-size:48px">/,
    )
    // And no bare space sits directly between the closing word span and the
    // next word span.
    expect(out).not.toContain(`</span> <span id="pg001_p000_w002"`)
  })

  it("applies the bundled font-family fallback to data-segments styles", () => {
    // wrapBySegments must use the same styleMapToInline as the renderer so
    // the exported EPUB renders fonts the same way the in-studio viewer
    // does — `Palatino,serif` becomes `Palatino,Merriweather,serif` so a
    // bundled face is available when the declared one isn't.
    const segments = [
      { text: "Hello", style: { "font-family": "Palatino,serif", color: "#000" } },
    ]
    const dataSegments = JSON.stringify(segments).replace(/"/g, "&quot;")
    const html =
      `<html><body><p data-id="pg001_p000" data-segments="${dataSegments}">` +
      `<span style="font-family:Palatino,Merriweather,serif;color:#000">Hello</span>` +
      `</p></body></html>`
    const out = wrapWordSpans(html)
    expect(out).toContain("font-family:Palatino,Merriweather,serif")
  })

  it("walks multiple [data-id] elements with independent word numbering", () => {
    const html =
      `<html><body><h1 data-id="pg001_n0001">Title here</h1><p data-id="pg001_n0002">Body.</p></body></html>`
    const out = wrapWordSpans(html)
    expect(out).toContain(`<span id="pg001_n0001_w001">Title</span>`)
    expect(out).toContain(`<span id="pg001_n0001_w002">here</span>`)
    expect(out).toContain(`<span id="pg001_n0002_w001">Body</span>`)
  })

  it("leaves elements without data-id untouched", () => {
    const html = `<html><body><div><p>not anchored</p></div></body></html>`
    const out = wrapWordSpans(html)
    expect(out).toContain(`<p>not anchored</p>`)
    expect(out).not.toContain(`<span id=`)
  })

  it("preserves attributes other than data-id verbatim", () => {
    const html = `<html><body><p data-id="pg001_n0001" class="lead">Hi.</p></body></html>`
    const out = wrapWordSpans(html)
    expect(out).toContain(`class="lead"`)
    expect(out).toContain(`data-id="pg001_n0001"`)
    expect(out).toContain(`<span id="pg001_n0001_w001">Hi</span>`)
  })
})
