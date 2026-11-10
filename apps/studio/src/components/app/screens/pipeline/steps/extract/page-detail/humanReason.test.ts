import { describe, expect, it, vi } from "vitest"

vi.mock("@lingui/core/macro", () => ({
  msg: (strings: TemplateStringsArray, ...values: unknown[]) => ({
    message: strings.reduce((text, part, index) => text + part + (index < values.length ? String(values[index]) : ""), ""),
  }),
}))

const { humanReason } = await import("./humanReason")

const text = (value: ReturnType<typeof humanReason>["label"]) => (typeof value === "string" ? value : value.message)

describe("humanReason", () => {
  it("explains a too-small image with both sizes", () => {
    const reason = humanReason("shortest side 13px < min_side 150px")
    expect(text(reason.label)).toBe("Too small (13px, needs 150px)")
    expect(reason.raw).toBe("shortest side 13px < min_side 150px")
  })

  it("names blank images", () => {
    expect(text(humanReason("stddev 0.0 < min_stddev 2").label)).toBe("Blank or a single colour")
    expect(text(humanReason("stddev 1.5 < min_stddev 2").label)).toBe("Blank or a single colour")
  })

  it("keeps the model's sentence for images judged not meaningful", () => {
    const reason = humanReason("not meaningful: Only a checkerboard placeholder.")
    expect(text(reason.label)).toBe("Not a meaningful image")
    expect(reason.detail).toBe("Only a checkerboard placeholder.")
  })

  it("covers the page render and manual removals", () => {
    expect(text(humanReason("full-page render").label)).toBe("A picture of the whole page")
    expect(text(humanReason("manual").label)).toBe("Removed by you")
  })

  it("says an auto figure filter image will be rebuilt as page elements, keeping the AI's reasoning", () => {
    const reason = humanReason("auto figure filter: A two-column table of words; the text is selectable.")
    expect(reason.kind).toBe("page-elements")
    expect(text(reason.label)).toBe("Will be rebuilt as page elements")
    expect(reason.explain && text(reason.explain)).toMatch(/HTML/)
    expect(reason.detail).toBe("A two-column table of words; the text is selectable.")
  })

  it("names every other reason kind with an explanation", () => {
    const cases: Array<[string, string, string]> = [
      ["longest side 5000px > max_side 4000px", "too-large", "Too large (5000px, limit 4000px)"],
      ["duplicate artwork: kept composite pg004_im003", "duplicate", "A copy of a kept figure"],
      ["segmented", "segmented", "Split into parts"],
      ["cropped", "cropped", "Replaced by its crop"],
      ["manual", "manual", "Removed by you"],
      ["full-page render", "full-page", "A picture of the whole page"],
      ["stddev 0.0 < min_stddev 2", "blank", "Blank or a single colour"],
      ["shortest side 13px < min_side 150px", "too-small", "Too small (13px, needs 150px)"],
    ]
    for (const [raw, kind, label] of cases) {
      const reason = humanReason(raw)
      expect(reason.kind).toBe(kind)
      expect(text(reason.label)).toBe(label)
      expect(reason.explain).not.toBeNull()
    }
  })

  it("explains a kept image the safety check saved, with the AI's sentence as detail", () => {
    const reason = humanReason("auto guard kept: raster artwork with no selectable-text copy and no surviving standalone duplicate (LLM: Looks like a border.)")
    expect(reason.kind).toBe("guard-kept")
    expect(text(reason.label)).toBe("Kept by a safety check")
    expect(reason.detail).toBe("Looks like a border.")
  })

  it("falls back to the raw reason, or a plain label when there is none", () => {
    expect(humanReason("some new rule").label).toBe("some new rule")
    expect(text(humanReason(undefined).label)).toBe("Filtered out")
    expect(humanReason("  ").raw).toBeNull()
  })
})
