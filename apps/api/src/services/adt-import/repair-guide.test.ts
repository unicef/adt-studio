import { describe, expect, it } from "vitest"
import { repairedArchiveName } from "./repair-guide.js"

describe("repairedArchiveName", () => {
  it("names the result after the uploaded ZIP", () => {
    expect(repairedArchiveName("repaired-adt.zip", "book")).toBe("repaired-adt-fixed.zip")
    expect(repairedArchiveName("Volcanoes.ZIP", "book")).toBe("Volcanoes-fixed.zip")
  })

  it("keeps only the file name when the browser sends a path", () => {
    expect(repairedArchiveName("C:\\Users\\me\\export.zip", "book")).toBe("export-fixed.zip")
  })

  it("falls back to the book label without a usable name", () => {
    expect(repairedArchiveName(undefined, "volcanoes")).toBe("volcanoes-fixed.zip")
    expect(repairedArchiveName(".zip", "volcanoes")).toBe("volcanoes-fixed.zip")
  })
})
