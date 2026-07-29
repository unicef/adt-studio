// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest"
import { applyGlossaryHighlights, removeGlossaryHighlights } from "./highlight"
import type { GlossaryData } from "@/features/glossary/state/glossary.atoms"

const DATA: GlossaryData = {
  school: {
    word: "school",
    definition: "a place to learn",
    variations: ["schools"],
    emoji: "🏫",
  },
}

beforeEach(() => {
  document.body.innerHTML = ""
})

function setContent(html: string): HTMLElement {
  const content = document.createElement("div")
  content.id = "content"
  content.innerHTML = html
  document.body.appendChild(content)
  return content
}

describe("applyGlossaryHighlights", () => {
  it("wraps the first occurrence in a clickable span", () => {
    const content = setContent(`<p>I go to a red school on Mango Avenue.</p>`)
    expect(applyGlossaryHighlights(DATA)).toBe(true)
    const span = content.querySelector<HTMLSpanElement>(".glossary-term")
    expect(span).not.toBeNull()
    expect(span!.textContent).toBe("school")
    expect(span!.getAttribute("data-glossary-key")).toBe("school")
    expect(span!.getAttribute("role")).toBe("button")
  })

  it("keeps the wrap typographically invisible via inline font: inherit", () => {
    // Fixed-layout pages carry the deterministic font on a segment span;
    // fonts.css applies the default serif to every bare `span`, which would
    // beat inheritance on the freshly created highlight span. The inline
    // `font: inherit` must be present to restore the segment font.
    const content = setContent(
      `<p><span style="font-family: 'Baloo 2'; font-size: 48px">red school ahead</span></p>`,
    )
    applyGlossaryHighlights(DATA)
    const span = content.querySelector<HTMLSpanElement>(".glossary-term")
    expect(span).not.toBeNull()
    expect(span!.style.font).toBe("inherit")
    // Still nested inside the styled segment, so inheritance resolves to it.
    expect(span!.parentElement?.style.fontFamily).toContain("Baloo")
  })

  it("removeGlossaryHighlights restores the original text", () => {
    const content = setContent(`<p>I go to a red school on Mango Avenue.</p>`)
    applyGlossaryHighlights(DATA)
    removeGlossaryHighlights()
    expect(content.querySelector(".glossary-term")).toBeNull()
    expect(content.textContent).toBe("I go to a red school on Mango Avenue.")
  })
})
