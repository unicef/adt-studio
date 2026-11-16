import { describe, expect, it } from "vitest"
import { isDeepStrictEqual } from "node:util"
import { Quiz, type TextCatalogEntry } from "@adt/types"
import { isProtectedContent, mergePreservingManual, stampManualEdits } from "../manual-edits.js"

const keyOf = (entry: TextCatalogEntry) => entry.id
const equalText = (a: TextCatalogEntry, b: TextCatalogEntry) => a.text === b.text
const previous: TextCatalogEntry[] = [
  { id: "manual", text: "A correction", source: "manual" },
  { id: "legacy", text: "Unknown authorship" },
  { id: "generated", text: "AI text", source: "ai" },
]

describe("stampManualEdits", () => {
  it("stamps only changed/new text, preserves unchanged authorship and ignores forged tags", () => {
    const next: TextCatalogEntry[] = [
      { ...previous[0], source: "ai" },
      { ...previous[1], source: "ai" },
      { ...previous[2], text: "Changed", source: "ai" },
      { id: "new", text: "Added", source: "ai" },
    ]
    expect(stampManualEdits(previous, next, keyOf, equalText)).toEqual([
      previous[0], previous[1],
      { id: "generated", text: "Changed", source: "manual" },
      { id: "new", text: "Added", source: "manual" },
    ])
  })

  it("ignores client source even with an exact-content comparator", () => {
    expect(stampManualEdits(previous, previous.map((entry) => ({ ...entry, source: "manual" })), keyOf, isDeepStrictEqual))
      .toEqual(previous)
  })

  it("compares by stable identity across reorder, deletion, empty text and additions", () => {
    const next: TextCatalogEntry[] = [previous[2], { ...previous[0], text: "" }]
    expect(stampManualEdits(previous, next, keyOf, equalText)).toEqual([
      previous[2], { ...previous[0], text: "", source: "manual" },
    ])
    expect(stampManualEdits(previous, [], keyOf, equalText)).toEqual([])
  })

  it("does not rewrite or mutate the base or pending draft", () => {
    const base = previous.map((entry) => Object.freeze({ ...entry }))
    const draft = Object.freeze(base.map((entry) => Object.freeze({ ...entry, text: "Edited" })))
    const serialized = JSON.stringify({ base, draft })
    stampManualEdits(Object.freeze(base), draft, keyOf, equalText)
    expect(JSON.stringify({ base, draft })).toBe(serialized)
  })

  it.each(["previous", "next"])("rejects duplicate %s identities", (side) => {
    const duplicate = [previous[0], { ...previous[0], text: "Another correction" }]
    expect(() => stampManualEdits(side === "previous" ? duplicate : previous, side === "next" ? duplicate : previous, keyOf, equalText))
      .toThrow("Duplicate preservation identity")
  })
})

describe("mergePreservingManual", () => {
  it("keeps protected records byte-for-byte including extra metadata, even on a generated collision", () => {
    const manual = Object.freeze({ ...previous[0], inputSignature: "old", reviewed: false })
    const legacy = Object.freeze({ ...previous[1], inputSignature: "older", reviewed: true })
    const existing = Object.freeze([manual, legacy, previous[2]])
    const generated: TextCatalogEntry[] = [
      { id: "legacy", text: "Would overwrite legacy" },
      { id: "manual", text: "Would overwrite correction" },
      { id: "generated", text: "New AI text" },
    ]
    const snapshot = JSON.stringify({ existing, generated })
    const merged = mergePreservingManual(generated, existing, keyOf)
    expect(merged[0]).toBe(legacy)
    expect(merged[1]).toBe(manual)
    expect(merged[2]).toEqual({ ...generated[2], source: "ai" })
    expect(JSON.stringify({ existing, generated })).toBe(snapshot)
    expect(merged[0]).not.toHaveProperty("source")
  })

  it("retains protected entries absent from generation, drops prior AI and stamps only new output", () => {
    expect(mergePreservingManual([{ id: "new", text: "New output" }], previous, keyOf)).toEqual([
      { id: "new", text: "New output", source: "ai" }, previous[0], previous[1],
    ])
    expect(mergePreservingManual([], previous, keyOf)).toEqual(previous.slice(0, 2))
    expect(mergePreservingManual([], [], keyOf)).toEqual([])
  })

  it("requires the caller to reconcile source removal without mutating retained history", () => {
    const activeSourceIds = new Set(["manual", "new"])
    const snapshot = JSON.stringify(previous)
    const merged = mergePreservingManual(
      [{ id: "new", text: "New translation" }],
      previous.filter((entry) => activeSourceIds.has(entry.id)),
      keyOf,
    )
    expect(merged.map(keyOf)).toEqual(["new", "manual"])
    expect(JSON.stringify(previous)).toBe(snapshot)
    expect(previous[1].text).toBe("Unknown authorship")
  })

  it.each(["existing", "generated"])("rejects duplicate %s identities instead of losing protected content", (side) => {
    const duplicate = [previous[0], { ...previous[0], text: "Another correction" }]
    expect(() => mergePreservingManual(side === "generated" ? duplicate : [], side === "existing" ? duplicate : previous, keyOf))
      .toThrow("Duplicate preservation identity")
  })

  it("rejects unresolved identities in either operation", () => {
    const entry = { id: "", text: "Correction" }
    expect(() => mergePreservingManual([], [entry], keyOf)).toThrow("stable, non-empty identity")
    expect(() => stampManualEdits([], [entry], keyOf, equalText)).toThrow("stable, non-empty identity")
  })

  it("preserves every protected entry for different generated subsets and orderings", () => {
    for (let mask = 0; mask < 8; mask++) {
      const generated = previous.filter((_, i) => mask & (1 << i)).reverse().map((entry) => ({ ...entry, text: "Generated" }))
      const merged = mergePreservingManual(generated, previous, keyOf)
      for (const entry of previous.filter(isProtectedContent)) {
        expect(merged.filter((candidate) => candidate.id === entry.id)).toEqual([entry])
      }
    }
  })
})

describe("quiz identity and authored content", () => {
  const quiz = (quizId: string, source?: "ai" | "manual") => Quiz.parse({
    quizId, source, quizIndex: 0, afterPageId: "pg001", pageIds: ["pg001"],
    question: "How many?", options: [
      { text: "One", explanation: "First" },
      { text: "Two", explanation: "Second" },
      { text: "Three", explanation: "Third" },
    ], answerIndex: 1, reasoning: "Counting",
  })
  const quizKey = (entry: Quiz) => entry.quizId!
  const quizContentEqual = (a: Quiz, b: Quiz) => {
    const { quizIndex: _a, ...aContent } = a
    const { quizIndex: _b, ...bContent } = b
    return isDeepStrictEqual(aContent, bContent)
  }

  it("does not mark a positional move as authorship, but stamps an answer edit", () => {
    const ai = quiz("qz001", "ai")
    const moved = { ...ai, quizIndex: 1, source: "manual" as const }
    expect(stampManualEdits([ai], [moved], quizKey, quizContentEqual)[0].source).toBe("ai")
    const edited = { ...ai, options: ai.options.map((option, i) => i === 1 ? { ...option, explanation: "Human explanation" } : option) }
    expect(stampManualEdits([ai], [edited], quizKey, quizContentEqual)[0].source).toBe("manual")
  })

  it("keeps protected quiz IDs and all content when no pages are eligible", () => {
    const saved = [quiz("qz002", "manual"), quiz("qz017"), quiz("qz025", "ai")]
    expect(mergePreservingManual([], saved, quizKey)).toEqual(saved.slice(0, 2))
    expect(mergePreservingManual([quiz("qz030", "ai")], saved, quizKey).map(quizKey)).toEqual(["qz030", "qz002", "qz017"])
  })
})
