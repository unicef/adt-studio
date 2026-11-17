import { describe, expect, it } from "vitest"
import {
  buildReaderUiCss,
  hasReaderUiCustomization,
  isSafeReaderCssColor,
  resolveReaderUiLayout,
} from "../reader-ui.js"
import { ReaderUiConfig } from "../reader-ui-schema.js"
import { AppConfig } from "../config.js"

describe("reader UI", () => {
  it("accepts plain colour values and rejects anything that could escape a declaration", () => {
    for (const ok of ["#0f5c5c", "oklch(0.7 0.1 200 / 50%)", "rgb(1, 2, 3)", "teal", "hsl(200 50% 40%)"]) {
      expect(isSafeReaderCssColor(ok)).toBe(true)
    }
    for (const bad of ["red; } body { display:none", "url(https://x)", "#fff /* x */", "", "a".repeat(65), "<script>"]) {
      expect(isSafeReaderCssColor(bad)).toBe(false)
    }
  })

  it("scopes tokens to the chrome roots and keeps light overrides out of dark mode", () => {
    const css = buildReaderUiCss({
      light: { primary: "#0f5c5c" },
      dark: { primary: "#7fd1d1" },
      radius: 1.25,
      font: "rounded",
    })
    expect(css).toContain("#interface-container:not(.dark), #nav-container:not(.dark) { --primary: #0f5c5c; }")
    expect(css).toContain("#interface-container.dark, #nav-container.dark { --primary: #7fd1d1; }")
    expect(css).toContain("--radius: 1.25rem;")
    expect(css).toContain("font-family: ui-rounded")
    expect(css).not.toMatch(/(^|[^-])body/)
  })

  it("drops unsafe values even when they bypass the schema", () => {
    const css = buildReaderUiCss({ light: { primary: "red; } body { display: none" } })
    expect(css).toBe("")
  })

  it("clamps the radius and emits nothing for an empty reader UI", () => {
    expect(buildReaderUiCss({ radius: 9 })).toContain("--radius: 2rem;")
    expect(buildReaderUiCss({})).toBe("")
    expect(buildReaderUiCss(undefined)).toBe("")
    expect(hasReaderUiCustomization({ layout: {}, light: {} })).toBe(false)
    expect(hasReaderUiCustomization({ radius: 0 })).toBe(true)
  })

  it("defaults every unset layout field", () => {
    expect(resolveReaderUiLayout({ panel_style: "drawer" })).toEqual({
      dock_position: "bottom",
      dock_width: "full",
      dock_align: "spread",
      panel_style: "drawer",
      panel_side: "left",
      panel_behavior: "overlay",
      button_style: "icon",
    })
  })

  it("validates reader_ui in the book config", () => {
    expect(ReaderUiConfig.safeParse({ layout: { dock_position: "left" }, light: { primary: "#000" } }).success).toBe(true)
    expect(ReaderUiConfig.safeParse({ light: { primary: "red;}" } }).success).toBe(false)
    expect(ReaderUiConfig.safeParse({ light: { "not-a-token": "#000" } }).success).toBe(false)
    expect(ReaderUiConfig.safeParse({ layout: { dock_position: "middle" } }).success).toBe(false)
    expect(AppConfig.safeParse({ reader_ui: { radius: 3 } }).success).toBe(false)
  })
})
