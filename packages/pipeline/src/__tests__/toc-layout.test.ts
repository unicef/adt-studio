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

  it("replaces fixed dot strings between separately extracted title and page leaves", () => {
    const leaves = [
      { text_id: "title-1", text_type: "text", text: "Acknowledgements" },
      { text_id: "page-1", text_type: "text", text: "v" },
      { text_id: "title-2", text_type: "text", text: "Introduction" },
      { text_id: "page-2", text_type: "text", text: "vi" },
    ]
    const repaired = repairTableOfContentsLayout(
      `<div class="space-y-3">
        <div class="flex w-full items-baseline gap-2">
          <span data-id="title-1">Acknowledgements</span>
          <span aria-hidden="true" data-toc-leader="true" class="min-w-0 flex-1 overflow-hidden whitespace-nowrap">................................................................</span>
          <span data-id="page-1">v</span>
        </div>
        <div>
          <span data-id="title-2">Introduction</span>
          <span data-id="page-2">vi</span>
        </div>
      </div>`,
      leaves,
    )

    expect(repaired).not.toContain("................................................................")
    expect(repaired.match(/data-toc-leader="true"/g)).toHaveLength(2)
    expect(repaired.match(/border-b-2 border-dotted/g)).toHaveLength(2)
    expect(repaired).toContain('<span data-id="title-1" class="min-w-0">Acknowledgements</span>')
    expect(repaired).toContain('<span data-id="page-1" class="shrink-0 text-right tabular-nums">v</span>')
    expect(tableOfContentsLayoutErrors(repaired, leaves)).toEqual([])
    expect(repairTableOfContentsLayout(repaired, leaves)).toBe(repaired)
  })

  it("removes a bare fixed dot string between separate leaves", () => {
    const leaves = [
      { text_id: "title", text_type: "text", text: "Introduction" },
      { text_id: "page", text_type: "text", text: "12" },
    ]
    const repaired = repairTableOfContentsLayout(
      '<div class="flex"><span data-id="title">Introduction</span>................................<span data-id="page">12</span></div>',
      leaves,
    )

    expect(repaired).not.toContain("................................")
    expect(repaired.match(/border-b-2 border-dotted/g)).toHaveLength(1)
    expect(repairTableOfContentsLayout(repaired, leaves)).toBe(repaired)
  })

  it("normalizes conflicting row and leader utilities across TOC pages", () => {
    const leaves = [
      { text_id: "title", text_type: "text", text: "Weather" },
      { text_id: "page", text_type: "text", text: "5" },
    ]
    const repaired = repairTableOfContentsLayout(
      `<div class="grid grid-cols-[auto_minmax(0,1fr)_auto] items-end gap-x-3 max-sm:gap-x-2 md:w-1/2 max-w-xl space-x-4">
        <span data-id="title">Weather</span>
        <span data-toc-leader="true" aria-hidden="true" class="min-w-0 grow border-b-2 border-dotted border-current opacity-50 mx-4">................................</span>
        <span data-id="page">5</span>
      </div>`,
      leaves,
    )

    expect(repaired).toContain('class="flex items-baseline w-full min-w-0 gap-0"')
    expect(repaired).toContain('class="mx-1.5 sm:mx-2 flex-1 min-w-6 border-b-2 border-dotted border-current opacity-80"')
    expect(repaired).not.toContain("grid-cols-")
    expect(repaired).not.toContain("gap-x-")
    expect(repaired).not.toContain("md:w-1/2")
    expect(repaired).not.toContain("max-w-xl")
    expect(repaired).not.toContain("space-x-4")
    expect(repairTableOfContentsLayout(repaired, leaves)).toBe(repaired)
  })

  it("removes conflicting layout utilities from separate leaves", () => {
    const leaves = [
      { text_id: "title", text_type: "text", text: "A very long introduction title" },
      { text_id: "page", text_type: "text", text: "12" },
    ]
    const repaired = repairTableOfContentsLayout(
      '<div class="flex"><span data-id="title" class="shrink-0 whitespace-nowrap">A very long introduction title</span><span data-toc-leader="true"></span><span data-id="page" class="absolute flex-1 w-full text-left">12</span></div>',
      leaves,
    )

    expect(repaired).not.toContain("whitespace-nowrap")
    expect(repaired).not.toContain("absolute")
    expect(repaired).not.toContain("flex-1 w-full")
    expect(repaired).not.toContain("text-left")
    expect(repaired).toContain('data-id="page" class="shrink-0 text-right tabular-nums"')
    expect(repairTableOfContentsLayout(repaired, leaves)).toBe(repaired)
  })

  it("uses padding for hierarchy so indented page numbers keep the same right edge", () => {
    const leaves = [
      { text_id: "activity", text_type: "text", text: "Activity 1.2 ........ 5" },
    ]
    const repaired = repairTableOfContentsLayout(
      '<div data-id="activity" class="adt-body ml-6 max-sm:ml-4 flex items-baseline w-full">Activity 1.2 ........ 5</div>',
      leaves,
    )

    expect(repaired).toContain("adt-body pl-6 max-sm:pl-4")
    expect(repaired).not.toMatch(/(?:^|[\s\"])ml-/)
    expect(repaired).not.toContain("max-sm:ml-")
    expect(repairTableOfContentsLayout(repaired, leaves)).toBe(repaired)
  })

  it("does not mistake a numbered chapter heading for a page-number row", () => {
    const html = '<h2 class="font-bold" data-id="chapter">Chapter 1</h2>'
    expect(repairTableOfContentsLayout(html, [
      { text_id: "chapter", text_type: "text", text: "Chapter 1" },
    ])).toBe(html)
  })

  it("does not mistake a split numbered chapter heading for a page-number row", () => {
    const html = '<h2><span data-id="chapter">Chapter</span><span data-id="number">1</span></h2>'
    expect(repairTableOfContentsLayout(html, [
      { text_id: "chapter", text_type: "heading", text: "Chapter", heading_level: 2 },
      { text_id: "number", text_type: "heading", text: "1", heading_level: 2 },
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
  it("accepts only stable normalized output", () => {
    const html = '<div data-id="toc-1" class="flex"><span>Digestive system</span><span class="border-dotted"></span><span>1</span></div>'
    const leaves = [
      { text_id: "toc-1", text_type: "text", text: "Digestive system........1" },
    ]

    expect(tableOfContentsLayoutErrors(html, leaves)).toHaveLength(1)
    const repaired = repairTableOfContentsLayout(html, leaves)
    expect(tableOfContentsLayoutErrors(repaired, leaves)).toEqual([])
  })
})
