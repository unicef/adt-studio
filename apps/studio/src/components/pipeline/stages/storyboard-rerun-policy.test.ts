import { describe, expect, it } from "vitest"
import {
  hasSectioningChanges,
  hasSectioningData,
} from "./storyboard-rerun-policy"

describe("hasSectioningData", () => {
  it("treats done as existing sectioning data", () => {
    expect(hasSectioningData("done")).toBe(true)
  })

  it("treats skipped as existing sectioning data", () => {
    expect(hasSectioningData("skipped")).toBe(true)
  })

  it("treats idle as missing sectioning data", () => {
    expect(hasSectioningData("idle")).toBe(false)
  })
})

describe("hasSectioningChanges", () => {
  it("returns true when prompt draft changed", () => {
    expect(hasSectioningChanges({}, "updated prompt")).toBe(true)
  })

  it("returns true when pruned section types changed", () => {
    expect(hasSectioningChanges({ pruned_section_types: true }, null)).toBe(true)
  })

  it("returns false for rendering-only changes", () => {
    expect(hasSectioningChanges({ default_render_strategy: true }, null)).toBe(false)
  })
})
