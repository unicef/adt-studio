// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  contentRoot,
  resolveAnchorElement,
  resolveAnchorPoint,
  scrollAnchorIntoView,
} from "./anchor-resolution"

function mount(html: string): void {
  document.body.innerHTML = html
}

function stubRect(element: Element, rect: Partial<DOMRect>): void {
  element.getBoundingClientRect = () =>
    ({
      left: 0,
      top: 0,
      width: 0,
      height: 0,
      right: 0,
      bottom: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
      ...rect,
    }) as DOMRect
}

beforeEach(() => {
  document.body.innerHTML = ""
})

describe("contentRoot", () => {
  it("finds the reader's content root", () => {
    mount('<div id="content"></div>')
    expect(contentRoot(document)?.id).toBe("content")
  })

  it("answers null for a document that has none, and for no document", () => {
    mount("<main></main>")
    expect(contentRoot(document)).toBeNull()
    expect(contentRoot(null)).toBeNull()
  })
})

describe("resolveAnchorElement", () => {
  it("resolves a selector scoped to the content root", () => {
    mount('<div id="content"><p data-id="para">hello</p></div>')
    const element = resolveAnchorElement(
      { selector: '#content [data-id="para"]', xOffsetPct: 0, yOffsetPct: 0 },
      contentRoot(document),
    )
    expect(element?.textContent).toBe("hello")
  })

  it("treats ambiguity as failure — two matches yield no pin", () => {
    mount('<div id="content"><p class="x">a</p><p class="x">b</p></div>')
    expect(
      resolveAnchorElement(
        { selector: "#content .x", xOffsetPct: 0, yOffsetPct: 0 },
        contentRoot(document),
      ),
    ).toBeNull()
  })

  it("ignores a match that lives outside the content root", () => {
    mount('<p class="x">outside</p><div id="content"></div>')
    expect(
      resolveAnchorElement(
        { selector: ".x", xOffsetPct: 0, yOffsetPct: 0 },
        contentRoot(document),
      ),
    ).toBeNull()
  })

  it("survives a selector the browser cannot parse", () => {
    mount('<div id="content"></div>')
    expect(
      resolveAnchorElement(
        { selector: "#content >>> nope", xOffsetPct: 0, yOffsetPct: 0 },
        contentRoot(document),
      ),
    ).toBeNull()
  })

  it("answers null without a root", () => {
    expect(
      resolveAnchorElement({ selector: "#content", xOffsetPct: 0, yOffsetPct: 0 }, null),
    ).toBeNull()
  })
})

describe("resolveAnchorPoint", () => {
  it("places the pin at the stored percentage of the element's box", () => {
    mount('<div id="content"><p data-id="para">hello</p></div>')
    const element = document.querySelector('[data-id="para"]') as Element
    stubRect(element, { left: 100, top: 200, width: 400, height: 50 })

    const point = resolveAnchorPoint(
      { selector: '#content [data-id="para"]', xOffsetPct: 25, yOffsetPct: 50 },
      contentRoot(document),
    )
    expect(point).toEqual({ x: 200, y: 225 })
  })

  it("answers null when the anchor no longer resolves", () => {
    mount('<div id="content"></div>')
    expect(
      resolveAnchorPoint(
        { selector: '#content [data-id="gone"]', xOffsetPct: 10, yOffsetPct: 10 },
        contentRoot(document),
      ),
    ).toBeNull()
  })
})

describe("scrollAnchorIntoView", () => {
  it("scrolls the anchored element and reports success", () => {
    mount('<div id="content"><p data-id="para">hello</p></div>')
    const element = document.querySelector('[data-id="para"]') as Element
    const scrollIntoView = vi.fn()
    element.scrollIntoView = scrollIntoView

    const scrolled = scrollAnchorIntoView(
      { selector: '#content [data-id="para"]', xOffsetPct: 0, yOffsetPct: 0 },
      contentRoot(document),
      "auto",
    )
    expect(scrolled).toBe(true)
    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: "auto",
      block: "center",
      inline: "nearest",
    })
  })

  it("reports failure when there is nothing to scroll to", () => {
    mount('<div id="content"></div>')
    expect(
      scrollAnchorIntoView(
        { selector: "#content .gone", xOffsetPct: 0, yOffsetPct: 0 },
        contentRoot(document),
        "auto",
      ),
    ).toBe(false)
  })
})
