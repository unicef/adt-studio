import { describe, expect, it } from "vitest"
import { runErrorOwner } from "./runErrorOwner"

const states = (map: Record<string, string>) => (stage: string) => map[stage] ?? "done"

describe("runErrorOwner", () => {
  it("attributes the book's run error to the only failed stage", () => {
    expect(runErrorOwner(states({ glossary: "error" }))).toBe("glossary")
  })

  it("attributes it to nobody when several stages failed", () => {
    expect(runErrorOwner(states({ glossary: "error", captions: "error" }))).toBeNull()
  })

  it("attributes it to nobody when no stage failed", () => {
    expect(runErrorOwner(states({}))).toBeNull()
  })
})
