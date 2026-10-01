import { describe, expect, it } from "vitest"
import { fixedPageSize } from "./pageSize"

describe("fixedPageSize", () => {
  it("reads the page box from the content wrapper", () => {
    const html =
      '<div id="content" data-fl-reference-width="1145" style="position:relative;width:573px;height:692px;margin:0 auto;overflow:hidden"><img></div>'
    expect(fixedPageSize(html)).toEqual({ width: 573, height: 692 })
  })

  it("accepts single quotes and spacing", () => {
    const html = "<div id='content' style='width: 800.5px ; height: 600px'></div>"
    expect(fixedPageSize(html)).toEqual({ width: 800.5, height: 600 })
  })

  it("returns null for reflowable sections", () => {
    expect(fixedPageSize("<section><h1>Title</h1></section>")).toBeNull()
    expect(fixedPageSize('<div class="prose"><p>Text</p></div>')).toBeNull()
  })

  it("ignores a wrapper that only sets one dimension", () => {
    expect(fixedPageSize('<div style="width:573px"></div>')).toBeNull()
  })

  it("does not read a max-width as the page width", () => {
    expect(fixedPageSize('<div style="max-width:573px;height:692px"></div>')).toBeNull()
  })
})
