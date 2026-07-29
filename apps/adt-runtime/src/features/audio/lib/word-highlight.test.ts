// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { elementSupportsWordHighlight } from "./word-highlight"

describe("elementSupportsWordHighlight", () => {
  it("uses block highlighting for structural layout wrappers", () => {
    document.body.innerHTML = `
      <div id="calculation">
        <div class="grid grid-cols-3"><div>m</div><div>cm</div><div>mm</div></div>
      </div>
    `

    expect(elementSupportsWordHighlight(document.querySelector<HTMLElement>("#calculation")!)).toBe(false)
  })

  it("keeps word highlighting for normal text elements", () => {
    document.body.innerHTML = '<p id="text">A normal sentence.</p>'
    expect(elementSupportsWordHighlight(document.querySelector<HTMLElement>("#text")!)).toBe(true)
  })
})
