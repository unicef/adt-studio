import { describe, expect, it } from "vitest"
import {
  repairTableOfContentsLayout,
  tableOfContentsLayoutErrors,
} from "../toc-layout.js"

describe("repairTableOfContentsLayout", () => {
  it("splits a dotted TOC leaf into title, leader, and right-aligned page number", () => {
    const repaired = repairTableOfContentsLayout(
      '<div data-id="toc-1" class="font-bold">Digestive system1</div>',
      [{ text_id: "toc-1", text_type: "text", text: "Digestive system........1" }],
    )
    expect(repaired).toContain("flex items-baseline w-full")
    expect(repaired).toContain(">Digestive system</span>")
    expect(repaired).toContain("flex-1 min-w-6 border-b-2 border-dotted")
    expect(repaired).toContain('<span class="sr-only">........</span>')
    expect(repaired).toContain('class="w-8 sm:w-10 shrink-0 text-right tabular-nums">1</span>')
  })

  it("adds a decorative leader when OCR merged title and page number", () => {
    const repaired = repairTableOfContentsLayout(
      '<p class="flex items-baseline" data-id="toc-2">Acknowledgementsv</p>',
      [{ text_id: "toc-2", text_type: "text", text: "Acknowledgementsv" }],
    )
    expect(repaired).toContain("border-dotted")
    expect(repaired).toContain(">Acknowledgements</span>")
    expect(repaired).toContain(">v</span>")
  })

  it("repairs nested unmarked rows without changing their wrapper hierarchy", () => {
    const repaired = repairTableOfContentsLayout(
      '<div data-id="toc-1" class="pl-6 flex"><span>Weather</span><span class="border-dotted"></span><span>5</span></div>',
      [{ text_id: "toc-1", text_type: "text", text: "Weather........5" }],
    )

    expect(repaired).toContain('data-id="toc-1" class="pl-6 flex items-baseline w-full min-w-0 gap-0"')
    expect(repaired).toContain('data-toc-title="true"')
    expect(repaired).toContain('<span class="sr-only">........</span>')
    expect(repaired).toContain('data-toc-page-number="true"')
    expect(tableOfContentsLayoutErrors(repaired, [
      { text_id: "toc-1", text_type: "text", text: "Weather........5" },
    ])).toEqual([])
  })

  it("recognizes and preserves spaced dot leaders", () => {
    const repaired = repairTableOfContentsLayout(
      '<div data-id="toc-1" class="flex"><span>Weather</span><span>5</span></div>',
      [{ text_id: "toc-1", text_type: "text", text: "Weather . . . . . 5" }],
    )

    expect(repaired).toContain('<span class="sr-only">. . . . .</span>')
    expect(repaired).toContain('data-toc-page-number="true" class="w-8 sm:w-10 shrink-0 text-right tabular-nums"> 5</span>')
    expect(tableOfContentsLayoutErrors(repaired, [
      { text_id: "toc-1", text_type: "text", text: "Weather . . . . . 5" },
    ])).toEqual([])
  })

  it("canonicalizes marked rows whose dots remain in the page-number span", () => {
    const repaired = repairTableOfContentsLayout(
      '<div data-id="toc-1" class="flex"><span data-toc-title="true">Weather  </span><span data-toc-leader="true" aria-hidden="true" class="border-dotted"></span><span data-toc-page-number="true">. . . . .  5</span></div>',
      [{ text_id: "toc-1", text_type: "text", text: "Weather . . . . . 5" }],
    )

    expect(repaired).toContain('<span data-toc-title="true" class="min-w-0 max-w-[82%]">Weather </span>')
    expect(repaired).toContain('<span class="sr-only">. . . . .</span>')
    expect(repaired).toContain('data-toc-page-number="true" class="w-8 sm:w-10 shrink-0 text-right tabular-nums"> 5</span>')
  })

  it("repairs a leader-only leaf that follows a separately extracted title", () => {
    const repaired = repairTableOfContentsLayout(
      '<div data-id="toc-1" class="flex"><span data-toc-title="true"></span><span data-toc-leader="true" aria-hidden="true" class="border-dotted"></span><span data-toc-page-number="true">. . . . . 43</span></div>',
      [{ text_id: "toc-1", text_type: "text", text: ". . . . . 43" }],
    )

    expect(repaired).toContain('data-toc-title="true" class="min-w-0 max-w-[82%]"></span>')
    expect(repaired).toContain('<span class="sr-only">. . . . .</span>')
    expect(repaired).toContain('data-toc-page-number="true" class="w-8 sm:w-10 shrink-0 text-right tabular-nums"> 43</span>')
  })

  it("is idempotent once a nested row has been repaired", () => {
    const leaves = [
      { text_id: "toc-1", text_type: "text", text: "Introduction........vi" },
    ]
    const once = repairTableOfContentsLayout(
      '<div data-id="toc-1" class="flex"><span>Introduction</span><span>vi</span></div>',
      leaves,
    )

    expect(repairTableOfContentsLayout(once, leaves)).toBe(once)
  })

  it("repairs every entry on consecutive contents pages", () => {
    const pageThree = repairTableOfContentsLayout(
      '<div class="space-y-1"><div class="flex items-baseline" data-id="p3-a">Acknowledgements v</div><div class="flex items-baseline pl-6" data-id="p3-b">Activity 8: Oral practice 9</div></div>',
      [
        { text_id: "p3-a", text_type: "text", text: "Acknowledgements v" },
        { text_id: "p3-b", text_type: "text", text: "Activity 8: Oral practice 9" },
      ],
    )
    const pageFour = repairTableOfContentsLayout(
      '<div class="space-y-1"><div class="flex items-baseline" data-id="p4-a">Activity 2: Reading practice 36</div><div class="flex items-baseline pl-6" data-id="p4-b">Activity 5: Oral practice 66</div></div>',
      [
        { text_id: "p4-a", text_type: "text", text: "Activity 2: Reading practice 36" },
        { text_id: "p4-b", text_type: "text", text: "Activity 5: Oral practice 66" },
      ],
    )

    for (const repaired of [pageThree, pageFour]) {
      expect(repaired.match(/border-dotted/g)).toHaveLength(2)
      expect(repaired.match(/tabular-nums/g)).toHaveLength(2)
    }
    expect(pageThree).toContain(">Acknowledgements </span>")
    expect(pageThree).toContain(">v</span>")
    expect(pageFour).toContain(">36</span>")
    expect(pageFour).toContain(">66</span>")
  })

  it("does not mistake a numbered chapter heading for a page-number row", () => {
    const html = '<h2 class="font-bold" data-id="chapter">Chapter 1</h2>'
    expect(repairTableOfContentsLayout(html, [
      { text_id: "chapter", text_type: "text", text: "Chapter 1" },
    ])).toBe(html)
  })

  it("removes obsolete leader siblings and a duplicate number overlay", () => {
    const repaired = repairTableOfContentsLayout(
      `<section>
        <div class="flex items-baseline"><span data-id="row-1" class="shrink-0">Reading practice ........ 36</span><span aria-hidden="true" class="hidden sm:block flex-1 border-b-2 border-dotted"></span></div>
        <div class="flex items-baseline"><span data-id="row-2" class="shrink-0">Writing practice ........ 37</span><span aria-hidden="true" class="hidden sm:block flex-1 border-b-2 border-dotted"></span></div>
        <div class="hidden sm:block absolute top-14 right-10"><div>36</div><div class="mt-4">37</div></div>
      </section>`,
      [
        { text_id: "row-1", text_type: "text", text: "Reading practice ........ 36" },
        { text_id: "row-2", text_type: "text", text: "Writing practice ........ 37" },
      ],
    )

    expect(repaired.match(/border-dotted/g)).toHaveLength(2)
    expect(repaired).not.toContain("hidden sm:block absolute")
    expect(repaired.match(/tabular-nums/g)).toHaveLength(2)
  })

  it("lets split long titles wrap before their terminal leader leaf", () => {
    const repaired = repairTableOfContentsLayout(
      '<div class="flex items-baseline flex-wrap sm:flex-nowrap"><span data-id="part-1">Activity 4: Reading sentences containing words with</span><span class="shrink-0" data-id="part-2">short and long vowels ........ 62</span></div>',
      [
        { text_id: "part-1", text_type: "text", text: "Activity 4: Reading sentences containing words with" },
        { text_id: "part-2", text_type: "text", text: "short and long vowels ........ 62" },
      ],
    )

    expect(repaired).not.toContain("sm:flex-nowrap")
    expect(repaired).toContain("flex-wrap")
    expect(repaired).toContain("> 62</span>")
  })

  it("does not alter ordinary non-TOC text", () => {
    const html = '<p data-id="body-1">Plants need water.</p>'
    expect(repairTableOfContentsLayout(html, [
      { text_id: "body-1", text_type: "text", text: "Plants need water." },
    ])).toBe(html)
  })
})

describe("tableOfContentsLayoutErrors", () => {
  it("rejects an unmarked nested row before repair", () => {
    const html = '<div data-id="toc-1" class="flex"><span>Digestive system</span><span class="border-dotted"></span><span>1</span></div>'
    expect(tableOfContentsLayoutErrors(html, [
      { text_id: "toc-1", text_type: "text", text: "Digestive system........1" },
    ])).toContainEqual(expect.stringContaining('data-id="toc-1"'))
  })

  it("accepts the marked title, leader, and page-number structure", () => {
    const html = '<div data-id="toc-1" class="flex"><span data-toc-title="true">Digestive system</span><span data-toc-leader="true" class="border-dotted"></span><span data-toc-page-number="true">1</span></div>'
    expect(tableOfContentsLayoutErrors(html, [
      { text_id: "toc-1", text_type: "text", text: "Digestive system........1" },
    ])).toEqual([])
  })
})
