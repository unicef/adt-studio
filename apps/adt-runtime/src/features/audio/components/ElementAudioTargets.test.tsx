// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render } from "@testing-library/react"

const playElement = vi.fn()

// The component reads its inputs from atoms and the audio context. Stub both so
// the test drives the DOM behavior directly (no provider / audio element).
vi.mock("jotai", () => ({
  useAtomValue: (atom: { __value: unknown }) => atom.__value,
}))
vi.mock("@/features/language/state/language.atoms", () => ({
  elementAudioIdsAtom: { __value: ["pg001_im001"] },
}))
vi.mock("@/features/navigation/state/nav.atoms", () => ({
  pageEpochAtom: { __value: 1 },
}))
vi.mock("@/features/audio/hooks/AudioPlayerContext", () => ({
  useAudioPlayerContext: () => ({ playElement }),
}))

import { ElementAudioTargets } from "./ElementAudioTargets"

describe("ElementAudioTargets (SPEC-0014 §4/§5)", () => {
  beforeEach(() => {
    playElement.mockReset()
    document.body.innerHTML = ""
  })

  afterEach(cleanup)

  it("makes an image with audio focusable and plays it on click and Enter/Space", () => {
    document.body.innerHTML = '<section><img data-id="pg001_im001" alt="Mago" /></section>'
    render(<ElementAudioTargets />)

    const img = document.querySelector("img")!
    expect(img.getAttribute("tabindex")).toBe("0")
    // An <img> resolves its accessible name from alt; no role needed.
    expect(img.getAttribute("role")).toBeNull()

    fireEvent.click(img)
    expect(playElement).toHaveBeenCalledWith("pg001_im001")

    fireEvent.keyDown(img, { key: "Enter" })
    fireEvent.keyDown(img, { key: " " })
    expect(playElement).toHaveBeenCalledTimes(3)
  })

  it("plays from the decorative badge and stops the click from selecting the page", () => {
    document.body.innerHTML = '<section><img data-id="pg001_im001" alt="Mago" /></section>'
    render(<ElementAudioTargets />)

    const badge = document.querySelector<HTMLElement>("[data-element-audio-badge]")!
    expect(badge).toBeTruthy()
    expect(badge.getAttribute("aria-hidden")).toBe("true")
    // A sibling of the [data-id] element, never a child.
    expect(badge.parentElement).toBe(document.querySelector("section"))

    let selected = false
    const onDocumentClick = () => {
      selected = true
    }
    document.addEventListener("click", onDocumentClick)
    try {
      fireEvent.click(badge)
    } finally {
      document.removeEventListener("click", onDocumentClick)
    }
    expect(playElement).toHaveBeenCalledWith("pg001_im001")
    expect(selected).toBe(false)
  })

  it("gives a non-image target an interactive role and a name slot", () => {
    document.body.innerHTML = '<section><p data-id="pg001_im001">Mago</p></section>'
    render(<ElementAudioTargets />)

    const p = document.querySelector("p")!
    expect(p.getAttribute("role")).toBe("button")
    expect(p.getAttribute("tabindex")).toBe("0")
  })

  it("leaves an element without audio untouched", () => {
    document.body.innerHTML = '<p data-id="pg001_t999">no audio</p>'
    render(<ElementAudioTargets />)

    const p = document.querySelector("p")!
    expect(p.getAttribute("tabindex")).toBeNull()
    expect(p.getAttribute("role")).toBeNull()
    expect(document.querySelector("[data-element-audio-badge]")).toBeNull()
  })

  it("leaves an image without alt untouched (AC-9 accessible name)", () => {
    document.body.innerHTML = '<section><img data-id="pg001_im001" /></section>'
    render(<ElementAudioTargets />)

    const img = document.querySelector("img")!
    expect(img.getAttribute("tabindex")).toBeNull()
    expect(document.querySelector("[data-element-audio-badge]")).toBeNull()
  })

  it("leaves an empty non-image untouched (AC-9 accessible name)", () => {
    document.body.innerHTML = '<section><span data-id="pg001_im001"></span></section>'
    render(<ElementAudioTargets />)

    const span = document.querySelector("span")!
    expect(span.getAttribute("tabindex")).toBeNull()
    expect(span.getAttribute("role")).toBeNull()
  })

  it("does not attach inside another interactive control", () => {
    document.body.innerHTML = '<button><img data-id="pg001_im001" alt="x" /></button>'
    render(<ElementAudioTargets />)
    expect(document.querySelector("img")!.getAttribute("tabindex")).toBeNull()
  })
})
