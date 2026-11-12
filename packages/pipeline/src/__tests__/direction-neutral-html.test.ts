import { describe, expect, it } from "vitest"
import { neutralizeDirectionMarkup } from "../direction-neutral-html.js"
import { resolvePageDirection } from "../language-context.js"

describe("resolvePageDirection", () => {
  it("is undefined for a book that is only ever read left to right", () => {
    expect(resolvePageDirection("en", ["en"])).toBeUndefined()
    expect(resolvePageDirection("en", ["en", "fr", "sw"])).toBeUndefined()
    expect(resolvePageDirection("es", undefined)).toBeUndefined()
  })

  it("is the source language's direction once any language is right-to-left", () => {
    expect(resolvePageDirection("ur", ["ur"])).toBe("rtl")
    expect(resolvePageDirection("ur", ["ur", "en"])).toBe("rtl")
    expect(resolvePageDirection("en", ["en", "ur"])).toBe("ltr")
    expect(resolvePageDirection("en", ["ar-EG"])).toBe("ltr")
  })
})

describe("neutralizeDirectionMarkup", () => {
  it("leaves a page with no left/right alignment or dir untouched", () => {
    const html = '<section><h1 class="text-center adt-h1">Title</h1><p class="adt-body">Text</p></section>'
    expect(neutralizeDirectionMarkup(html, "ltr")).toBe(html)
    expect(neutralizeDirectionMarkup(html, "rtl")).toBe(html)
  })

  it("maps left/right to start/end for a page written left to right, keeping variant prefixes", () => {
    expect(
      neutralizeDirectionMarkup('<p class="text-left md:text-right font-bold">Hi</p>', "ltr"),
    ).toBe('<p class="text-start md:text-end font-bold">Hi</p>')
  })

  it("maps the other way round for a page written right to left", () => {
    expect(
      neutralizeDirectionMarkup('<p class="text-right">متن</p><p class="text-left">متن</p>', "rtl"),
    ).toBe('<p class="text-start">متن</p><p class="text-end">متن</p>')
  })

  // A <th> centres itself unless an ancestor sets alignment explicitly, and
  // `start` does not count as explicit: without its own class the header would
  // jump from the left to the centre in the page's own language.
  it("gives a table header that was inheriting left or right the class itself", () => {
    expect(
      neutralizeDirectionMarkup(
        '<div class="text-left"><table><tr><th class="px-2">A</th><th class="text-center">B</th><th>C</th></tr></table></div>',
        "ltr",
      ),
    ).toBe(
      '<div class="text-start"><table><tr><th class="px-2 text-start">A</th><th class="text-center">B</th><th class="text-start">C</th></tr></table></div>',
    )
  })

  it("does not touch a table header whose nearest explicit alignment is not left or right", () => {
    const html = '<div class="text-left"><div class="text-center"><table><tr><th>A</th></tr></table></div></div>'
    expect(neutralizeDirectionMarkup(html, "ltr")).toBe(
      '<div class="text-start"><div class="text-center"><table><tr><th>A</th></tr></table></div></div>',
    )
  })

  it("removes a dir that only repeats the direction the element already has", () => {
    expect(
      neutralizeDirectionMarkup('<div dir="rtl" class="p-4"><p dir="rtl">متن</p><p dir="ltr">Hello</p></div>', "rtl"),
    ).toBe('<div class="p-4"><p>متن</p><p dir="ltr">Hello</p></div>')
  })

  it("keeps a dir that changes the direction, and what is nested inside it", () => {
    const html = '<p dir="rtl">متن <span dir="ltr">ABC</span></p>'
    expect(neutralizeDirectionMarkup(html, "ltr")).toBe(html)
    // Inside a left-to-right block of a right-to-left page, `rtl` is not redundant.
    const nested = '<div dir="ltr"><p dir="rtl">متن</p></div>'
    expect(neutralizeDirectionMarkup(nested, "rtl")).toBe(nested)
  })

  // `start` and `end` are resolved against the element's own direction. Mapped
  // for the page's instead, a block pinned the other way changes side in the
  // page's own language (measured in Chromium: left before, right after).
  it("AC-4: maps a block whose dir differs from the page's for its own direction", () => {
    expect(
      neutralizeDirectionMarkup(
        '<p dir="ltr" class="text-left">Hello</p><div dir="ltr"><p class="text-left">A</p><p class="text-right">B</p></div>',
        "rtl",
      ),
    ).toBe('<p dir="ltr" class="text-start">Hello</p><div dir="ltr"><p class="text-start">A</p><p class="text-end">B</p></div>')
    expect(neutralizeDirectionMarkup('<p dir="rtl" class="text-right">متن</p>', "ltr")).toBe(
      '<p dir="rtl" class="text-start">متن</p>',
    )
    // A header that has to carry the class itself gets it for its own direction too.
    expect(
      neutralizeDirectionMarkup('<div class="text-left"><table dir="ltr"><tr><th>A</th></tr></table></div>', "rtl"),
    ).toBe('<div class="text-end"><table dir="ltr"><tr><th class="text-start">A</th></tr></table></div>')
  })

  it("only rewrites opening tags: text, other attributes and quoting are byte-identical", () => {
    const html = `<p class='text-left' data-note="a > b" title='x "y"'>1 &lt; 2 &amp; text-left stays in text</p>`
    expect(neutralizeDirectionMarkup(html, "ltr")).toBe(
      `<p class='text-start' data-note="a > b" title='x "y"'>1 &lt; 2 &amp; text-left stays in text</p>`,
    )
  })

  it("is stable when applied twice", () => {
    const once = neutralizeDirectionMarkup(
      '<div class="text-left" dir="ltr"><table><tr><th>A</th></tr></table><p class="lg:text-right">B</p></div>',
      "ltr",
    )
    expect(neutralizeDirectionMarkup(once, "ltr")).toBe(once)
  })

  describe("floated boxes", () => {
    // The box a model floats beside the text has to change side with the text.
    it("AC-14: maps a float, and the clear that goes with it, for the direction the page was written in", () => {
      expect(
        neutralizeDirectionMarkup(
          '<aside class="float-right w-[34%] ms-8 max-lg:float-none">نوٹ</aside><p class="clear-right">متن</p>',
          "rtl",
        ),
      ).toBe('<aside class="float-start w-[34%] ms-8 max-lg:float-none">نوٹ</aside><p class="clear-start">متن</p>')
      expect(
        neutralizeDirectionMarkup('<img class="float-right lg:float-left clear-left" src="a.png">', "ltr"),
      ).toBe('<img class="float-end lg:float-start clear-start" src="a.png">')
    })

    it("AC-14: moves the gap beside a floated box with it, and no other margin", () => {
      expect(
        neutralizeDirectionMarkup(
          '<aside class="float-right w-[34%] ml-8 mb-6 max-lg:float-none max-lg:ml-0">Note</aside><p class="ml-4">Text</p>',
          "ltr",
        ),
      ).toBe('<aside class="float-end w-[34%] ms-8 mb-6 max-lg:float-none max-lg:ms-0">Note</aside><p class="ml-4">Text</p>')
      // Already logical float, physical gap: the gap still has to follow it.
      expect(neutralizeDirectionMarkup('<aside class="float-start -ml-2">نوٹ</aside>', "rtl")).toBe(
        '<aside class="float-start -me-2">نوٹ</aside>',
      )
    })

    it("AC-14: keeps a float on the side it was given, whatever script is inside it", () => {
      const html = '<aside class="float-left">نوٹ</aside>'
      expect(neutralizeDirectionMarkup(html, "rtl")).toBe('<aside class="float-end">نوٹ</aside>')
      expect(neutralizeDirectionMarkup(html, "rtl", { correctMisalignedText: true })).toBe(
        '<aside class="float-end">نوٹ</aside>',
      )
    })

    // A float and its `clear` are resolved against the direction of the box
    // they sit in; the gap beside the float against the element's own.
    it("AC-14: maps a float inside a block whose dir differs from the page's for that block's direction", () => {
      expect(
        neutralizeDirectionMarkup(
          '<div dir="ltr"><img class="float-left mr-4" src="a.png"><p class="clear-left">Text</p></div>',
          "rtl",
        ),
      ).toBe('<div dir="ltr"><img class="float-start me-4" src="a.png"><p class="clear-start">Text</p></div>')
      // The float follows the box it sits in (the page); its own dir only turns its gap.
      expect(neutralizeDirectionMarkup('<aside dir="ltr" class="float-left mr-4">Note</aside>', "rtl")).toBe(
        '<aside dir="ltr" class="float-end me-4">Note</aside>',
      )
    })

    it("AC-14: is stable when applied twice", () => {
      const once = neutralizeDirectionMarkup('<aside class="float-right text-left">A</aside>', "rtl")
      expect(once).toBe('<aside class="float-start text-end">A</aside>')
      expect(neutralizeDirectionMarkup(once, "rtl")).toBe(once)
    })
  })

  describe("correctMisalignedText (newly generated right-to-left pages only)", () => {
    it("starts right-to-left text that was pushed to the left, and leaves a left-to-right block at the end", () => {
      expect(
        neutralizeDirectionMarkup(
          '<h1 class="text-left">عنوان</h1><p class="text-left">English only</p>',
          "rtl",
          { correctMisalignedText: true },
        ),
      ).toBe('<h1 class="text-start">عنوان</h1><p class="text-end">English only</p>')
    })

    // The TOC repair right-aligns page numbers in a fixed-width cell, which is
    // right for a left-to-right row. In a right-to-left row that cell is at the
    // far left, and the numbers share its left edge.
    it("aligns a table-of-contents page number to the end of its cell", () => {
      const cell = '<span data-toc-page-number="true" class="w-8 shrink-0 text-right tabular-nums">12</span>'
      expect(neutralizeDirectionMarkup(cell, "rtl", { correctMisalignedText: true })).toBe(
        '<span data-toc-page-number="true" class="w-8 shrink-0 text-end tabular-nums">12</span>',
      )
      // Without the correction it is preserved where it was.
      expect(neutralizeDirectionMarkup(cell, "rtl")).toBe(
        '<span data-toc-page-number="true" class="w-8 shrink-0 text-start tabular-nums">12</span>',
      )
    })

    it("does not duplicate a class when a repair step re-added the physical one", () => {
      expect(
        neutralizeDirectionMarkup(
          '<span data-toc-page-number="true" class="w-8 shrink-0 text-end tabular-nums text-right">12</span>',
          "rtl",
          { correctMisalignedText: true },
        ),
      ).toBe('<span data-toc-page-number="true" class="w-8 shrink-0 text-end tabular-nums">12</span>')
    })

    // Seen on every floated box of the first real run: `float-right` copied
    // from the left-to-right example, next to a start-side (right) gap.
    it("moves a floated box's gap to the text side when it is only on the outer side", () => {
      expect(
        neutralizeDirectionMarkup(
          '<aside class="float-right mb-6 ms-8 w-[34%] max-lg:float-none max-lg:ms-0">نوٹ</aside>',
          "rtl",
          { correctMisalignedText: true },
        ),
      ).toBe('<aside class="float-start mb-6 me-8 w-[34%] max-lg:float-none max-lg:me-0">نوٹ</aside>')
    })

    it("leaves a floated box's gap alone on the text side, on both sides, and when packaging", () => {
      const textSide = '<aside class="float-start me-8">نوٹ</aside>'
      expect(neutralizeDirectionMarkup(textSide, "rtl", { correctMisalignedText: true })).toBe(textSide)
      const bothSides = '<aside class="float-end ms-8 me-2">نوٹ</aside>'
      expect(neutralizeDirectionMarkup(bothSides, "rtl", { correctMisalignedText: true })).toBe(bothSides)
      // Packaging keeps a page a person has already seen exactly as it looks.
      expect(neutralizeDirectionMarkup('<aside class="float-right ms-8">نوٹ</aside>', "rtl")).toBe(
        '<aside class="float-start ms-8">نوٹ</aside>',
      )
    })

    it("changes nothing in a page written left to right", () => {
      for (const html of ['<p class="text-right">Signed</p>', '<p dir="rtl" class="text-left">متن</p>']) {
        expect(neutralizeDirectionMarkup(html, "ltr", { correctMisalignedText: true })).toBe(
          neutralizeDirectionMarkup(html, "ltr"),
        )
      }
    })
  })
})
