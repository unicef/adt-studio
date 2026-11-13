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

    it("changes nothing in a page written left to right", () => {
      const html = '<p class="text-right">Signed</p>'
      expect(neutralizeDirectionMarkup(html, "ltr", { correctMisalignedText: true })).toBe(
        neutralizeDirectionMarkup(html, "ltr"),
      )
    })
  })
})
