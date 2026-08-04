// @vitest-environment jsdom

import { describe, expect, it } from "vitest"
import {
  applyTextColors,
  MANUAL_TEXT_COLOR_ATTRIBUTE,
  restoreAppliedTextColors,
} from "./text-color"

describe("semantic text colors", () => {
  it("restores source styles before a manual color edit is serialized", () => {
    document.body.innerHTML = `
      <p class="text-black" data-id="body" data-text-color="#111827">
        Body <span class="font-bold">emphasis</span>
      </p>
    `
    const body = document.querySelector<HTMLElement>('[data-id="body"]')!
    const emphasis = body.querySelector<HTMLElement>("span")!

    applyTextColors(document)
    expect(body.style.getPropertyValue("color")).toBe("rgb(17, 24, 39)")
    expect(body.style.getPropertyPriority("color")).toBe("important")
    expect(emphasis.style.getPropertyValue("color")).toBe("inherit")

    body.className = "text-blue-600"
    body.removeAttribute("data-text-color")
    body.setAttribute(MANUAL_TEXT_COLOR_ATTRIBUTE, "")
    restoreAppliedTextColors(document)
    const serialized = document.body.innerHTML
    applyTextColors(document)

    expect(serialized).toContain('class="text-blue-600"')
    expect(serialized).not.toContain("data-text-color")
    expect(serialized).not.toContain("data-adt-original-color")
    expect(serialized).toContain(MANUAL_TEXT_COLOR_ATTRIBUTE)
    expect(body.style.getPropertyValue("color")).toBe("")
    expect(emphasis.style.getPropertyValue("color")).toBe("")
  })

  it("does not override a manual color on a descendant", () => {
    document.body.innerHTML = `
      <p data-text-color="#111827">
        Body <span class="text-blue-600" ${MANUAL_TEXT_COLOR_ATTRIBUTE}>link-like text</span>
      </p>
    `
    const body = document.querySelector<HTMLElement>("p")!
    const span = body.querySelector<HTMLElement>("span")!

    applyTextColors(document)

    expect(body.style.getPropertyPriority("color")).toBe("important")
    expect(span.style.getPropertyValue("color")).toBe("")
  })

  it("preserves a source inline color after preview-only styles are restored", () => {
    document.body.innerHTML =
      '<p data-text-color="#111827" style="color: rgb(220, 38, 38)">Body</p>'
    const body = document.querySelector<HTMLElement>("p")!

    applyTextColors(document)
    restoreAppliedTextColors(document)

    expect(body.style.getPropertyValue("color")).toBe("rgb(220, 38, 38)")
    expect(body.style.getPropertyPriority("color")).toBe("")
  })
})
