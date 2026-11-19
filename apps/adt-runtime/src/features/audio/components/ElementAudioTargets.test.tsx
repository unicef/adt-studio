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

const atoms = (await import("@/features/language/state/language.atoms")) as unknown as {
  elementAudioIdsAtom: { __value: string[] }
}

function setContent(html: string): void {
  document.body.innerHTML = `<div id="content">${html}</div>`
}

describe("ElementAudioTargets (SPEC-0014 §4/§5)", () => {
  beforeEach(() => {
    playElement.mockReset()
    atoms.elementAudioIdsAtom.__value = ["pg001_im001"]
    document.body.innerHTML = ""
  })

  afterEach(cleanup)

  it("makes an image with audio focusable and plays it on click and Enter/Space", () => {
    setContent('<section><img data-id="pg001_im001" alt="Mago" /></section>')
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
    setContent('<section><img data-id="pg001_im001" alt="Mago" /></section>')
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
    setContent('<section><p data-id="pg001_im001">Mago</p></section>')
    render(<ElementAudioTargets />)

    const p = document.querySelector("p")!
    expect(p.getAttribute("role")).toBe("button")
    expect(p.getAttribute("tabindex")).toBe("0")
  })

  it("leaves an element without audio untouched", () => {
    setContent('<p data-id="pg001_t999">no audio</p>')
    render(<ElementAudioTargets />)

    const p = document.querySelector("p")!
    expect(p.getAttribute("tabindex")).toBeNull()
    expect(p.getAttribute("role")).toBeNull()
    expect(document.querySelector("[data-element-audio-badge]")).toBeNull()
  })

  it("leaves an image without alt untouched (AC-9 accessible name)", () => {
    setContent('<section><img data-id="pg001_im001" /></section>')
    render(<ElementAudioTargets />)

    const img = document.querySelector("img")!
    expect(img.getAttribute("tabindex")).toBeNull()
    expect(document.querySelector("[data-element-audio-badge]")).toBeNull()
  })

  it("leaves an empty non-image untouched (AC-9 accessible name)", () => {
    setContent('<section><span data-id="pg001_im001"></span></section>')
    render(<ElementAudioTargets />)

    const span = document.querySelector("span")!
    expect(span.getAttribute("tabindex")).toBeNull()
    expect(span.getAttribute("role")).toBeNull()
  })

  it("does not attach inside another interactive control", () => {
    setContent('<button><img data-id="pg001_im001" alt="x" /></button>')
    render(<ElementAudioTargets />)
    expect(document.querySelector("img")!.getAttribute("tabindex")).toBeNull()
  })

  it("anchors the badge to its parent and keeps two targets apart", () => {
    atoms.elementAudioIdsAtom.__value = ["pg001_im001", "pg001_im002"]
    setContent(
      '<section><img data-id="pg001_im001" alt="Uno" /><img data-id="pg001_im002" alt="Dos" /></section>',
    )
    const section = document.querySelector("section")!
    const [first, second] = Array.from(document.querySelectorAll("img"))
    const rect = (left: number, top: number, width: number, height: number) => ({
      left,
      top,
      right: left + width,
      bottom: top + height,
      width,
      height,
      x: left,
      y: top,
      toJSON: () => ({}),
    })
    section.getBoundingClientRect = () => rect(0, 0, 400, 300)
    first.getBoundingClientRect = () => rect(10, 20, 100, 80)
    second.getBoundingClientRect = () => rect(200, 20, 100, 80)

    render(<ElementAudioTargets />)

    // The parent is the containing block, so the overlay cannot fall back to
    // the viewport (the bug this test pins).
    expect(section.style.position).toBe("relative")
    const badges = Array.from(
      document.querySelectorAll<HTMLElement>("[data-element-audio-badge]"),
    )
    expect(badges.map((badge) => badge.dataset.elementAudioBadgeFor)).toEqual([
      "pg001_im001",
      "pg001_im002",
    ])
    expect(badges[0].style.left).toBe("96px")
    expect(badges[1].style.left).toBe("286px")
    expect(badges[0].style.top).toBe("20px")
    expect(badges[1].style.top).toBe("20px")
  })

  it("restores the parent's position when the manifest drops the element", () => {
    setContent('<section><img data-id="pg001_im001" alt="Mago" /></section>')
    const section = document.querySelector("section")!
    section.style.position = "absolute"
    const { rerender } = render(<ElementAudioTargets />)
    // Already positioned by the book: the runtime must not touch it.
    expect(section.style.position).toBe("absolute")

    atoms.elementAudioIdsAtom.__value = []
    rerender(<ElementAudioTargets />)
    expect(section.style.position).toBe("absolute")
  })

  it("restores a static parent when the manifest drops the element", () => {
    setContent('<section><img data-id="pg001_im001" alt="Mago" /></section>')
    const section = document.querySelector("section")!
    const { rerender } = render(<ElementAudioTargets />)
    expect(section.style.position).toBe("relative")

    atoms.elementAudioIdsAtom.__value = []
    rerender(<ElementAudioTargets />)
    expect(section.style.position).toBe("")
  })

  it("removes the runtime attributes when the manifest no longer includes the element", () => {
    setContent('<section><img data-id="pg001_im001" alt="Mago" /></section>')
    const { rerender } = render(<ElementAudioTargets />)
    const img = document.querySelector("img")!
    expect(img.getAttribute("tabindex")).toBe("0")
    expect(document.querySelector("[data-element-audio-badge]")).toBeTruthy()

    atoms.elementAudioIdsAtom.__value = []
    rerender(<ElementAudioTargets />)

    expect(img.getAttribute("tabindex")).toBeNull()
    expect(document.querySelector("[data-element-audio-badge]")).toBeNull()
  })
})
