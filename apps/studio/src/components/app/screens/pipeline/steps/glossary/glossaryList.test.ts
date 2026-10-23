import { describe, expect, it } from "vitest"
import { buildGlossaryList, type GlossaryListState } from "./glossaryList"
import type { GlossaryRow } from "./glossaryRows"

const row = (word: string, extra: Partial<GlossaryRow> = {}): GlossaryRow => ({
  _key: word,
  id: word,
  word,
  definition: `${word} means`,
  variations: [],
  emojis: [],
  source: "ai",
  ...extra,
})

const rows = [row("delta"), row("alpha", { pruned: true }), row("charlie", { source: "manual" }), row("bravo")]
const occurrences = new Map([
  ["delta", { count: 1, pages: [1] }],
  ["bravo", { count: 5, pages: [3] }],
  ["charlie", { count: 2, pages: [2] }],
])
const state: GlossaryListState = { search: "", filter: "active", mineOnly: false, sort: "book" }

describe("buildGlossaryList", () => {
  it("puts pruned terms in a tray at the end in tray mode", () => {
    const list = buildGlossaryList(rows, occurrences, "tray", state)
    expect(list.main.map((r) => r.word)).toEqual(["delta", "charlie", "bravo"])
    expect(list.tray.map((r) => r.word)).toEqual(["alpha"])
    expect(list.counts).toEqual({ active: 3, pruned: 1, all: 4, mine: 1 })
  })

  it("filters pruned terms in place in inline mode", () => {
    expect(buildGlossaryList(rows, occurrences, "inline", state).main.map((r) => r.word)).toEqual(["delta", "charlie", "bravo"])
    expect(buildGlossaryList(rows, occurrences, "inline", { ...state, filter: "pruned" }).main.map((r) => r.word)).toEqual(["alpha"])
    expect(buildGlossaryList(rows, occurrences, "inline", { ...state, filter: "all" }).tray).toEqual([])
  })

  it("sorts A–Z and by use", () => {
    expect(buildGlossaryList(rows, occurrences, "tray", { ...state, sort: "az" }).main.map((r) => r.word)).toEqual(["bravo", "charlie", "delta"])
    expect(buildGlossaryList(rows, occurrences, "tray", { ...state, sort: "usage" }).main.map((r) => r.word)).toEqual(["bravo", "charlie", "delta"])
  })

  it("searches every field and reports matches against the filter scope", () => {
    const list = buildGlossaryList(rows, occurrences, "tray", { ...state, search: "ALPHA MEANS" })
    expect(list.main).toEqual([])
    expect(list.tray.map((r) => r.word)).toEqual(["alpha"])
    expect(list.matches).toEqual({ shown: 1, total: 4 })
  })

  it("shows only your own terms when asked", () => {
    expect(buildGlossaryList(rows, occurrences, "tray", { ...state, mineOnly: true }).main.map((r) => r.word)).toEqual(["charlie"])
  })
})
