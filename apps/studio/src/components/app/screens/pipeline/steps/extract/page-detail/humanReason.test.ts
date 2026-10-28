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

  it("falls back to the raw reason, or a plain label when there is none", () => {
    expect(humanReason("some new rule").label).toBe("some new rule")
    expect(text(humanReason(undefined).label)).toBe("Filtered out")
    expect(humanReason("  ").raw).toBeNull()
  })
})
