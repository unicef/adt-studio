// @vitest-environment jsdom
import { renderHook } from "@testing-library/react"
import { createStore, Provider } from "jotai"
import { afterEach, describe, expect, it } from "vitest"
import type { ReactNode } from "react"
import {
} from "@/features/kids/state/kids.atoms"
import {
  readingFontAtom,
  textScaleAtom,
  type ReadingFont,
  type TextScale,
} from "@/shared/state/ui.atoms"
import { useKidsReadingComfort } from "./useKidsReadingComfort"

function styleTag() {
  return document.getElementById("kids-reading-comfort")
}

function renderComfort(
  active: boolean,
  opts: { scale?: TextScale; font?: ReadingFont } = {},
) {
  const store = createStore()
  if (opts.scale) store.set(textScaleAtom, opts.scale)
  if (opts.font) store.set(readingFontAtom, opts.font)
  const wrapper = ({ children }: { children: ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  )
  return renderHook(({ a }) => useKidsReadingComfort(a), {
    wrapper,
    initialProps: { a: active },
  })
}

afterEach(() => {
  document.getElementById("kids-reading-comfort")?.remove()
})

describe("useKidsReadingComfort", () => {
  it("injects a zoom + font rule for a scaled, spaced reader", () => {
    renderComfort(true, { scale: "1.5", font: "spaced" })
    const css = styleTag()?.textContent ?? ""
    expect(css).toContain("#content { zoom: 1.5; }")
    expect(css).toContain("letter-spacing: 0.06em !important")
    expect(css).toContain("font-family:")
  })

  it("writes no style tag at defaults (scale 1, book font)", () => {
    renderComfort(true, { scale: "1", font: "default" })
    expect(styleTag()).toBeNull()
  })

  it("removes the style tag when kids mode goes inactive", () => {
    const view = renderComfort(true, { scale: "2", font: "plain" })
    expect(styleTag()).not.toBeNull()
    view.rerender({ a: false })
    expect(styleTag()).toBeNull()
  })
})
