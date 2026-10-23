import { describe, expect, it } from "vitest"
import { stableSelect } from "./stableSelect"

interface Row {
  id: string
  word: string
}

const keyOf = (row: Row) => row.id
const az = (list: readonly Row[]) => [...list].sort((a, b) => a.word.localeCompare(b.word))
const server: Row[] = [
  { id: "1", word: "beta" },
  { id: "2", word: "alpha" },
  { id: "3", word: "gamma" },
]

describe("stableSelect", () => {
  it("is the plain selection when there is no draft", () => {
    expect(stableSelect(server, server, keyOf, az).items.map(keyOf)).toEqual(["2", "1", "3"])
  })

  it("keeps a renamed row where it was until the draft is saved", () => {
    const current = server.map((row) => (row.id === "2" ? { ...row, word: "zz" } : row))
    const { items } = stableSelect(current, server, keyOf, az)
    expect(items.map(keyOf)).toEqual(["2", "1", "3"])
    expect(items[0].word).toBe("zz")
  })

  it("keeps a row that stopped matching, and flags it", () => {
    const onlyA = (list: readonly Row[]) => list.filter((row) => row.word.includes("a"))
    const current = server.map((row) => (row.id === "1" ? { ...row, word: "zzz" } : row))
    const result = stableSelect(current, server, keyOf, onlyA)
    expect(result.items.map(keyOf)).toEqual(["1", "2", "3"])
    expect([...result.stale]).toEqual(["1"])
  })

  it("places new rows where they were inserted and drops removed ones", () => {
    const current = [server[0], { id: "n", word: "aaa" }, server[2]]
    expect(stableSelect(current, server, keyOf, (list) => [...list]).items.map(keyOf)).toEqual(["1", "n", "3"])
  })
})
