import { describe, expect, it } from "vitest"
import { diffLines, withContext } from "./line-diff"

describe("diffLines", () => {
  it("marks removed and added lines around unchanged ones", () => {
    expect(diffLines("a\nb\nc", "a\nB\nc\nd")).toEqual([
      { kind: "same", text: "a" },
      { kind: "del", text: "b" },
      { kind: "add", text: "B" },
      { kind: "same", text: "c" },
      { kind: "add", text: "d" },
    ])
  })

  it("collapses unchanged lines far from any change", () => {
    const before = Array.from({ length: 20 }, (_, index) => `line ${index}`).join("\n")
    const after = before.replace("line 10", "changed")
    const rows = withContext(diffLines(before, after), 2)
    expect(rows[0]).toEqual({ kind: "gap", hidden: 8 })
    expect(rows.filter((row) => row.kind !== "gap").map((row) => row.kind)).toEqual(["same", "same", "del", "add", "same", "same"])
    expect(rows.at(-1)).toEqual({ kind: "gap", hidden: 7 })
  })
})
