// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest"
import {
  anchorForElement,
  anchorFromPoint,
  buildAnchor,
  contentRoot,
  elementAtPoint,
  nearestAnchorElement,
  paintedBox,
  resolveAnchor,
  type CommentAnchor,
} from "./anchor"

/**
 * Structure lifted from a real `adt` export (`pg017_sec001.html`): `#content`
 * wrapping a `section[data-section-type]`, text nodes carrying `data-id`, an
 * image with a `data-id`, and several layout `div`s with no hook at all.
 */
const PAGE = `
<main class="w-full">
  <h1 class="sr-only" id="page-heading">PRATICANDO</h1>
  <div class="container mx-auto" id="content">
    <section data-section-type="activity_fill_in_the_blank" data-section-id="pg017_sec001">
      <div class="mb-6">
        <div class="h-14">
          <div class="h-full">
            <span data-id="pg017_n0002">PRATICANDO</span>
          </div>
        </div>
      </div>
      <p>
        <span data-id="pg017_n0004">Observe esta conta.</span>
      </p>
      <div>
        <div>
          <div>
            <img data-id="pg017_im001_seg001_v1" src="images/x.png" alt="Conta">
          </div>
          <div>
            <span data-id="pg017_n0006">GLOSSÁRIO</span>
            <span data-id="pg017_n0007">kWh:</span>
          </div>
        </div>
      </div>
      <div>
        <div><p data-id="pg017_n0010">a) a data</p></div>
        <div><p data-id="pg017_n0011">b) o mês</p></div>
        <div><p data-id="pg017_n0012">c) o valor</p></div>
      </div>
      <div class="unhooked">
        <p>first unhooked paragraph</p>
        <p>second unhooked paragraph</p>
      </div>
    </section>
  </div>
</main>
`

function renderPage(html = PAGE): Element {
  document.body.innerHTML = html
  const root = contentRoot()
  if (!root) throw new Error("fixture has no #content")
  return root
}

/** jsdom has no layout, so boxes are declared per element for the offset math. */
function stubRect(element: Element, rect: { x: number; y: number; width: number; height: number }) {
  element.getBoundingClientRect = () =>
    new DOMRect(rect.x, rect.y, rect.width, rect.height)
}

/**
 * jsdom implements no hit testing, so the drag path's `elementsFromPoint` is
 * stubbed with the stack a browser would report: topmost first, which for a drag
 * is always the pin the pointer is carrying.
 */
function stubPointStack(stack: Element[]) {
  ;(document as Document & { elementsFromPoint: (x: number, y: number) => Element[] })
    .elementsFromPoint = () => stack
}

afterEach(() => {
  document.body.innerHTML = ""
  delete (document as Document & { elementsFromPoint?: unknown }).elementsFromPoint
})

describe("nearestAnchorElement", () => {
  it("walks up to the closest hooked ancestor", () => {
    const root = renderPage()
    const text = root.querySelector('[data-id="pg017_n0010"]')!
    const textNodeParent = text.firstChild?.parentElement ?? text
    expect(nearestAnchorElement(textNodeParent, root)).toBe(text)
  })

  it("stops at the section when the markup in between is unhooked", () => {
    const root = renderPage()
    const paragraph = root.querySelector(".unhooked p")!
    expect(nearestAnchorElement(paragraph, root)).toBe(root.querySelector("section"))
  })

  it("falls back to #content when nothing on the way up is hooked", () => {
    const root = renderPage()
    root.querySelector("section")!.removeAttribute("data-section-id")
    const paragraph = root.querySelector(".unhooked p")!
    expect(nearestAnchorElement(paragraph, root)).toBe(root)
  })

  it("refuses elements outside #content", () => {
    const root = renderPage()
    const heading = document.getElementById("page-heading")!
    expect(nearestAnchorElement(heading, root)).toBeNull()
  })
})

describe("buildAnchor", () => {
  it("prefers a short data-id selector when it is unique", () => {
    const root = renderPage()
    const span = root.querySelector('[data-id="pg017_n0004"]')!
    stubRect(span, { x: 100, y: 200, width: 400, height: 40 })

    const anchor = buildAnchor(span, 200, 210, { root })
    expect(anchor).toEqual({
      selector: '#content [data-id="pg017_n0004"]',
      xOffsetPct: 25,
      yOffsetPct: 25,
    })
  })

  it("anchors an image by its data-id", () => {
    const root = renderPage()
    const image = root.querySelector("img")!
    stubRect(image, { x: 0, y: 0, width: 200, height: 100 })

    expect(buildAnchor(image, 150, 75, { root })?.selector).toBe(
      '#content [data-id="pg017_im001_seg001_v1"]',
    )
  })

  it("anchors a click on page padding to #content itself", () => {
    const root = renderPage()
    stubRect(root, { x: 0, y: 0, width: 1000, height: 2000 })

    const anchor = buildAnchor(root, 500, 1000, { root })
    expect(anchor?.selector).toBe("#content")
    expect(anchor).toMatchObject({ xOffsetPct: 50, yOffsetPct: 50 })
  })

  it("falls back to a positional path with :nth-of-type when a hook is not unique", () => {
    const root = renderPage()
    const target = root.querySelector('[data-id="pg017_n0010"]')!
    root.querySelector('[data-id="pg017_n0011"]')!.setAttribute("data-id", "pg017_n0010")
    stubRect(target, { x: 0, y: 0, width: 100, height: 20 })

    const anchor = buildAnchor(target, 50, 10, { root })
    expect(anchor?.selector).toBe(
      '#content > [data-section-id="pg017_sec001"] > div:nth-of-type(3) > div:nth-of-type(1) > [data-id="pg017_n0010"]',
    )
    expect(resolveAnchor(anchor!, { root })?.element).toBe(target)
  })

  it("clamps offsets into 0–100 and survives a zero-size box", () => {
    const root = renderPage()
    const span = root.querySelector('[data-id="pg017_n0006"]')!
    stubRect(span, { x: 100, y: 100, width: 0, height: 0 })

    expect(buildAnchor(span, 40, 4000, { root })).toMatchObject({
      xOffsetPct: 50,
      yOffsetPct: 50,
    })
  })

  it("escapes quotes in hook values", () => {
    const root = renderPage()
    const span = root.querySelector('[data-id="pg017_n0007"]')!
    span.setAttribute("data-id", 'odd"value')
    stubRect(span, { x: 0, y: 0, width: 10, height: 10 })

    const anchor = buildAnchor(span, 5, 5, { root })
    expect(anchor?.selector).toBe('#content [data-id="odd\\"value"]')
    expect(resolveAnchor(anchor!, { root })?.element).toBe(span)
  })

  it("returns null when there is no #content root", () => {
    document.body.innerHTML = "<div><p id='orphan'>text</p></div>"
    expect(buildAnchor(document.getElementById("orphan")!, 0, 0)).toBeNull()
  })
})

describe("elementAtPoint", () => {
  it("looks past the overlay to the book content underneath", () => {
    const root = renderPage()
    const pin = document.createElement("button")
    document.body.append(pin)
    const span = root.querySelector('[data-id="pg017_n0004"]')!
    stubPointStack([pin, span, root])

    expect(elementAtPoint(10, 10, root)).toBe(span)
  })

  it("is null when nothing under the pointer belongs to #content", () => {
    const root = renderPage()
    const heading = document.getElementById("page-heading")!
    stubPointStack([heading, document.body])

    expect(elementAtPoint(10, 10, root)).toBeNull()
  })
})

describe("anchorFromPoint", () => {
  it("re-anchors a dropped pin to whatever it was dropped on", () => {
    const root = renderPage()
    const target = root.querySelector('[data-id="pg017_n0012"]')!
    stubRect(target, { x: 100, y: 500, width: 200, height: 100 })
    stubPointStack([document.createElement("button"), target, root])

    expect(anchorFromPoint(150, 550, { root })).toEqual({
      selector: '#content [data-id="pg017_n0012"]',
      xOffsetPct: 25,
      yOffsetPct: 50,
    })
  })

  it("refuses a drop that landed off the book, so the pin can revert", () => {
    const root = renderPage()
    stubPointStack([document.getElementById("page-heading")!])

    expect(anchorFromPoint(5, 5, { root })).toBeNull()
  })

  it("round-trips a drag: the moved pin resolves back to the drop target", () => {
    const root = renderPage()
    const from = root.querySelector('[data-id="pg017_n0004"]')!
    const to = root.querySelector('[data-id="pg017_n0011"]')!
    stubRect(from, { x: 0, y: 0, width: 100, height: 20 })
    stubRect(to, { x: 300, y: 700, width: 400, height: 40 })

    const before = buildAnchor(from, 50, 10, { root })!
    expect(resolveAnchor(before, { root })!.element).toBe(from)

    stubPointStack([to, root])
    const after = anchorFromPoint(500, 720, { root })!
    expect(resolveAnchor(after, { root })!.element).toBe(to)
    expect(resolveAnchor(after, { root })!.position()).toEqual({ x: 500, y: 720 })
  })
})

describe("anchorForElement", () => {
  it("anchors the keyboard path to the centre of the focused element", () => {
    const root = renderPage()
    const span = root.querySelector('[data-id="pg017_n0010"]')!
    stubRect(span, { x: 40, y: 80, width: 200, height: 50 })

    expect(anchorForElement(span, { root })).toEqual({
      anchor: {
        selector: '#content [data-id="pg017_n0010"]',
        xOffsetPct: 50,
        yOffsetPct: 50,
      },
      point: { x: 140, y: 105 },
    })
  })

  it("is null for an element outside the book content", () => {
    const root = renderPage()
    expect(anchorForElement(document.getElementById("page-heading")!, { root })).toBeNull()
  })
})

describe("resolveAnchor", () => {
  it("round-trips a built anchor to the same element and point", () => {
    const root = renderPage()
    const span = root.querySelector('[data-id="pg017_n0011"]')!
    stubRect(span, { x: 40, y: 80, width: 200, height: 50 })

    const anchor = buildAnchor(span, 140, 105, { root })!
    const resolved = resolveAnchor(anchor, { root })!
    expect(resolved.element).toBe(span)
    expect(resolved.position()).toEqual({ x: 140, y: 105 })
  })

  it("re-reads layout on every call, so a reflow moves the pin with the text", () => {
    const root = renderPage()
    const span = root.querySelector('[data-id="pg017_n0011"]')!
    stubRect(span, { x: 0, y: 0, width: 100, height: 100 })
    const anchor = buildAnchor(span, 25, 50, { root })!
    const resolved = resolveAnchor(anchor, { root })!
    expect(resolved.position()).toEqual({ x: 25, y: 50 })

    stubRect(span, { x: 200, y: 400, width: 400, height: 200 })
    expect(resolved.position()).toEqual({ x: 300, y: 500 })
  })

  it("lands on the same content at a different viewport width", () => {
    const root = renderPage()
    const span = root.querySelector('[data-id="pg017_n0012"]')!
    stubRect(span, { x: 0, y: 0, width: 1000, height: 100 })
    const anchor = buildAnchor(span, 700, 50, { root })!

    stubRect(span, { x: 0, y: 0, width: 400, height: 40 })
    expect(resolveAnchor(anchor, { root })?.position()).toEqual({ x: 280, y: 20 })
  })

  it("fails on an ambiguous selector rather than guessing a node", () => {
    const root = renderPage()
    const ambiguous: CommentAnchor = {
      selector: "#content p",
      xOffsetPct: 50,
      yOffsetPct: 50,
    }
    expect(resolveAnchor(ambiguous, { root })).toBeNull()
  })

  it("fails when the selector matches nothing", () => {
    const root = renderPage()
    expect(
      resolveAnchor({ selector: '#content [data-id="gone"]', xOffsetPct: 0, yOffsetPct: 0 }, { root }),
    ).toBeNull()
  })

  it("fails on a malformed selector instead of throwing", () => {
    const root = renderPage()
    expect(
      resolveAnchor({ selector: "#content ((", xOffsetPct: 0, yOffsetPct: 0 }, { root }),
    ).toBeNull()
  })

  it("ignores a match that lives outside #content", () => {
    const root = renderPage()
    expect(
      resolveAnchor({ selector: "#page-heading", xOffsetPct: 0, yOffsetPct: 0 }, { root }),
    ).toBeNull()
  })

  it("degrades a pin whose element was dropped from a newer snapshot", () => {
    const root = renderPage()
    const span = root.querySelector('[data-id="pg017_n0004"]')!
    stubRect(span, { x: 0, y: 0, width: 100, height: 100 })
    const anchor = buildAnchor(span, 50, 50, { root })!

    span.remove()
    expect(resolveAnchor(anchor, { root })).toBeNull()
  })
})

describe("precise anchors — live cursors", () => {
  it("anchors to the exact element under the pointer, not the section it sits in", () => {
    const root = renderPage()
    const paragraph = root.querySelector(".unhooked p:nth-of-type(2)")!
    stubRect(paragraph, { x: 100, y: 200, width: 400, height: 20 })
    stubPointStack([paragraph])

    const anchor = anchorFromPoint(300, 210, { root, precise: true })!
    expect(anchor.selector).toBe(
      '#content [data-section-id="pg017_sec001"] > div:nth-of-type(4) > p:nth-of-type(2)',
    )
    expect(anchor).toMatchObject({ xOffsetPct: 50, yOffsetPct: 50 })
    /** A pin at the same point still climbs to the section, as it always has. */
    expect(anchorFromPoint(300, 210, { root })?.selector).toBe(
      '#content [data-section-id="pg017_sec001"]',
    )
  })

  it("follows the element when the layout moves it, as a caption box does when it stacks", () => {
    const root = renderPage()
    const paragraph = root.querySelector(".unhooked p")!
    stubRect(paragraph, { x: 600, y: 400, width: 300, height: 40 })
    stubPointStack([paragraph])
    const anchor = anchorFromPoint(750, 410, { root, precise: true })!

    stubRect(paragraph, { x: 20, y: 900, width: 350, height: 60 })
    expect(resolveAnchor(anchor, { root, precise: true })?.position()).toEqual({ x: 195, y: 915 })
  })

  it("measures across a cropped picture's painted image, so the same spot survives a new crop", () => {
    const root = renderPage()
    const img = root.querySelector("img")! as HTMLImageElement
    Object.defineProperty(img, "naturalWidth", { value: 1000 })
    Object.defineProperty(img, "naturalHeight", { value: 1000 })
    img.style.objectFit = "cover"
    img.style.objectPosition = "50% 50%"

    /** Wide window: a 1000×500 box crops the square photo top and bottom. */
    stubRect(img, { x: 0, y: 0, width: 1000, height: 500 })
    stubPointStack([img])
    const anchor = anchorFromPoint(250, 250, { root, precise: true })!
    expect(anchor).toMatchObject({ xOffsetPct: 25, yOffsetPct: 50 })

    /** Narrow window: a 400×400 box shows the whole photo — the same spot is a quarter across. */
    stubRect(img, { x: 0, y: 0, width: 400, height: 400 })
    expect(resolveAnchor(anchor, { root, precise: true })?.position()).toEqual({ x: 100, y: 200 })
  })
})

describe("precise anchors — selector length", () => {
  it("names a deeply nested element from its hook, and never past what the room accepts", () => {
    const depth = 60
    const nested = "<div>".repeat(depth) + '<p class="deep">deep</p>' + "</div>".repeat(depth)
    const root = renderPage(`<div id="content"><section data-section-id="s1">${nested}</section></div>`)
    const deep = root.querySelector(".deep")!
    stubRect(deep, { x: 0, y: 0, width: 100, height: 10 })
    stubPointStack([deep])

    const anchor = anchorFromPoint(50, 5, { root, precise: true })!
    expect(anchor.selector.length).toBeLessThanOrEqual(512)
    /** Sixty positional steps do not fit, so the cursor keeps the section rather than vanishing. */
    expect(anchor.selector).toBe('#content [data-section-id="s1"]')
  })
})

describe("paintedBox", () => {
  const box = { left: 0, top: 0, width: 400, height: 200 }
  const square = { width: 100, height: 100 }

  it("covers: scales up to fill and centres the overflow", () => {
    expect(paintedBox(box, square, "cover", "50% 50%")).toEqual({ left: 0, top: -100, width: 400, height: 400 })
  })

  it("contains: scales to fit and centres the letterbox", () => {
    expect(paintedBox(box, square, "contain", "50% 50%")).toEqual({ left: 100, top: 0, width: 200, height: 200 })
  })

  it("honours object-position in percent and in pixels", () => {
    expect(paintedBox(box, square, "contain", "0% 0%").left).toBe(0)
    expect(paintedBox(box, square, "contain", "100% 0%").left).toBe(200)
    expect(paintedBox(box, square, "contain", "12px 0px").left).toBe(12)
  })

  it("leaves a plain stretched image, and a picture with no size yet, as the element box", () => {
    expect(paintedBox(box, square, "fill", "50% 50%")).toEqual(box)
    expect(paintedBox(box, { width: 0, height: 0 }, "cover", "50% 50%")).toEqual(box)
  })
})
