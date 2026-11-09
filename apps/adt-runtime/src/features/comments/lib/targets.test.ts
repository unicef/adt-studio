// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest"
import { contentRoot } from "./anchor"
import { contentTargets, stepTarget, targetIndexOf } from "./targets"

const PAGE = `
<main>
  <h1 id="page-heading">PRATICANDO</h1>
  <div id="content">
    <section data-section-id="pg017_sec001">
      <p><span data-id="pg017_n0004">Observe esta conta.</span></p>
      <div data-area-id="pg017_area01">
        <span data-id="pg017_n0006">GLOSS&Aacute;RIO</span>
        <span data-id="pg017_n0007" aria-hidden="true">decorative</span>
      </div>
      <p data-id="pg017_n0010">a) a data</p>
      <p class="collapsed" data-id="pg017_n0011">b) o m&ecirc;s</p>
      <p>unhooked, so not a stop</p>
    </section>
  </div>
</main>
`

function renderPage(): Element {
  document.body.innerHTML = PAGE
  const root = contentRoot()
  if (!root) throw new Error("fixture has no #content")
  for (const element of Array.from(root.querySelectorAll("*"))) {
    const collapsed = element.classList.contains("collapsed")
    element.getBoundingClientRect = () =>
      new DOMRect(0, 0, collapsed ? 0 : 200, collapsed ? 0 : 20)
  }
  root.getBoundingClientRect = () => new DOMRect(0, 0, 800, 600)
  return root
}

afterEach(() => {
  document.body.innerHTML = ""
})

describe("contentTargets", () => {
  it("walks the stable hooks in document order, coarse to fine", () => {
    const root = renderPage()
    expect(contentTargets(root).map((element) => hookOf(element))).toEqual([
      "pg017_sec001",
      "pg017_n0004",
      "pg017_area01",
      "pg017_n0006",
      "pg017_n0010",
    ])
  })

  it("skips a collapsed element, which a reviewer could not see a pin on", () => {
    const root = renderPage()
    expect(contentTargets(root).map(hookOf)).not.toContain("pg017_n0011")
  })

  it("skips aria-hidden decoration", () => {
    const root = renderPage()
    expect(contentTargets(root).map(hookOf)).not.toContain("pg017_n0007")
  })
})

describe("targetIndexOf", () => {
  it("finds a target by identity", () => {
    const root = renderPage()
    const targets = contentTargets(root)
    expect(targetIndexOf(targets, targets[2])).toBe(2)
  })

  it("attributes a descendant to its innermost enclosing target", () => {
    const root = renderPage()
    const targets = contentTargets(root)
    const inner = root.querySelector('[data-id="pg017_n0006"]')!
    expect(targets[targetIndexOf(targets, inner)]).toBe(inner)
  })

  it("attributes unhooked markup to the target that contains it", () => {
    const root = renderPage()
    const targets = contentTargets(root)
    const unhooked = Array.from(root.querySelectorAll("p")).at(-1)!
    expect(hookOf(targets[targetIndexOf(targets, unhooked)])).toBe("pg017_sec001")
  })

  it("is -1 for nothing at all", () => {
    const root = renderPage()
    expect(targetIndexOf(contentTargets(root), null)).toBe(-1)
  })
})

describe("stepTarget", () => {
  const targets = [{}, {}, {}] as unknown as Element[]

  it("wraps forwards at the end", () => {
    expect(stepTarget(targets, 2, 1)).toBe(0)
  })

  it("wraps backwards at the start", () => {
    expect(stepTarget(targets, 0, -1)).toBe(2)
  })

  it("enters at either end when nothing is focused yet", () => {
    expect(stepTarget(targets, -1, 1)).toBe(0)
    expect(stepTarget(targets, -1, -1)).toBe(2)
  })

  it("has no stop to offer on a page with no hooks", () => {
    expect(stepTarget([], -1, 1)).toBe(-1)
  })
})

function hookOf(element: Element): string {
  return (
    element.getAttribute("data-id") ??
    element.getAttribute("data-area-id") ??
    element.getAttribute("data-section-id") ??
    "?"
  )
}
