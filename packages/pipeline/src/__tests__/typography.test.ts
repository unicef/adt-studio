import { describe, it, expect } from "vitest"
import type { Storage } from "@adt/storage"
import { DEFAULT_TYPOGRAPHY, type BookTypography } from "@adt/types"
import { readTypography, buildTypographyCss, TYPOGRAPHY_NODE } from "../typography.js"

const fakeStorage = (typography?: unknown) =>
  ({
    getLatestNodeData: (node: string) =>
      node === TYPOGRAPHY_NODE && typography ? { data: typography, version: 1 } : null,
  }) as unknown as Storage

describe("readTypography", () => {
  it("falls back to accessible defaults when no node is stored", () => {
    expect(readTypography(fakeStorage())).toEqual(DEFAULT_TYPOGRAPHY)
  })

  it("falls back to defaults when the stored map is empty or malformed", () => {
    expect(readTypography(fakeStorage({ styles: [] }))).toEqual(DEFAULT_TYPOGRAPHY)
    expect(readTypography(fakeStorage({ nonsense: true }))).toEqual(DEFAULT_TYPOGRAPHY)
  })

  it("returns the stored typography when present", () => {
    const custom: BookTypography = {
      styles: [{ key: "body", label: "Body", className: "adt-body", desktopPx: 22, mobilePx: 17 }],
    }
    expect(readTypography(fakeStorage(custom))).toEqual(custom)
  })
})

describe("buildTypographyCss", () => {
  it("emits one fluid clamp rule per semantic class", () => {
    const css = buildTypographyCss(DEFAULT_TYPOGRAPHY)
    expect(css).toContain(".adt-body { font-size: clamp(16px,")
    expect(css).toContain("24px); }") // body desktop ceiling
    expect(css).toContain(".adt-h1 { font-size: clamp(30px,")
    // Every default style produces a rule.
    for (const s of DEFAULT_TYPOGRAPHY.styles) {
      expect(css).toContain(`.${s.className} { font-size: clamp(`)
    }
  })

  it("uses a fixed size (no clamp) when desktop <= mobile", () => {
    const css = buildTypographyCss({
      styles: [{ key: "body", label: "Body", className: "adt-body", desktopPx: 18, mobilePx: 18 }],
    })
    expect(css).toContain(".adt-body { font-size: 18px; }")
    // The rule itself must be a fixed size, not a clamp expression.
    expect(css).not.toMatch(/\.adt-body \{ font-size: clamp/)
  })

  it("emits an optional font-weight when set", () => {
    const css = buildTypographyCss({
      styles: [{ key: "body", label: "Body", className: "adt-body", desktopPx: 24, mobilePx: 16, fontWeight: 600 }],
    })
    expect(css).toContain("font-weight: 600;")
  })
})
