import { describe, expect, it } from "vitest"
import { parseCliArgs } from "../cli-args.js"

describe("parseCliArgs", () => {
  it("parses valid arguments", () => {
    const parsed = parseCliArgs([
      "test-book",
      "./assets/raven.pdf",
      "--start-page",
      "1",
      "--end-page",
      "3",
    ])

    expect(parsed.label).toBe("test-book")
    expect(parsed.startPage).toBe(1)
    expect(parsed.endPage).toBe(3)
  })

  it("rejects unsafe labels", () => {
    expect(() => parseCliArgs(["../escape", "./assets/raven.pdf"])).toThrow(
      "filesystem-safe"
    )
  })

  it("rejects invalid page values", () => {
    expect(() =>
      parseCliArgs(["test-book", "./assets/raven.pdf", "--start-page", "abc"])
    ).toThrow("Expected number")
  })

  it("rejects invalid page ranges", () => {
    expect(() =>
      parseCliArgs([
        "test-book",
        "./assets/raven.pdf",
        "--start-page",
        "4",
        "--end-page",
        "2",
      ])
    ).toThrow("--start-page must be less than or equal to --end-page")
  })

  it("rejects unknown options", () => {
    expect(() =>
      parseCliArgs(["test-book", "./assets/raven.pdf", "--bad-flag"])
    ).toThrow("Unknown option")
  })
})
