import { describe, it, expect } from "vitest"
import type { Storage } from "@adt/storage"
import { DEFAULT_TYPOGRAPHY, type BookTypography } from "@adt/types"
import {
  readTypography,
  buildTypographyCss,
  typographyPreservationErrors,
  TYPOGRAPHY_NODE,
} from "../typography.js"

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

describe("typographyPreservationErrors", () => {
  const original =
    '<h1 class="adt-h1">T</h1><p class="adt-body">a</p><p class="adt-body">b</p><figcaption class="adt-caption">c</figcaption>'

  it("passes when all adt-* classes are preserved (layout-only change)", () => {
    const revised =
      '<h1 class="adt-h1 text-center">T</h1><p class="adt-body">a</p><div><p class="adt-body">b</p></div><figcaption class="adt-caption">c</figcaption>'
    expect(typographyPreservationErrors(original, revised)).toEqual([])
  })

  it("flags a dropped adt-* class", () => {
    // One adt-body removed, one swapped for text-lg.
    const revised = '<h1 class="adt-h1">T</h1><p class="adt-body">a</p><p class="text-lg">b</p><figcaption class="adt-caption">c</figcaption>'
    const errors = typographyPreservationErrors(original, revised)
    expect(errors.length).toBe(1)
    expect(errors[0]).toContain("adt-body")
  })

  it("flags an added inline font-size", () => {
    const revised = original.replace('<p class="adt-body">a</p>', '<p class="adt-body" style="font-size: 14px">a</p>')
    const errors = typographyPreservationErrors(original, revised)
    expect(errors.some((e) => e.includes("font-size"))).toBe(true)
  })

  it("does not fire when the original had no typography classes", () => {
    expect(typographyPreservationErrors("<p>plain</p>", "<p class='text-sm'>plain</p>")).toEqual([])
  })
})
