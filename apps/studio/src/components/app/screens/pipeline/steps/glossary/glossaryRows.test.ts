import { describe, expect, it } from "vitest"
import type { GlossaryOutput } from "@/api/client"
import { classifyTerm, fromRows, sameTerm, toRows, withTextEdit } from "./glossaryRows"

const doc: GlossaryOutput = {
  items: [
    { id: "g1", source: "ai", word: "alpha", definition: "first", variations: ["alphas"], emojis: ["🅰️"] },
    { source: "manual", word: "beta", definition: "second", variations: [], emojis: [] },
  ],
  pageCount: 2,
  generatedAt: "2026-01-01",
  version: 3,
}

describe("glossary rows", () => {
  it("gives every term a client key and strips it again on save", () => {
    const rows = toRows(doc)
    expect(rows.map((row) => row._key)).toEqual(["g1", "k1"])
    expect(fromRows(doc, rows).items).toEqual(doc.items)
  })

  it("keeps an edited AI term an AI term while it is a draft", () => {
    const [alpha] = toRows(doc)
    const edited = withTextEdit(alpha, { definition: "changed" })
    expect(edited.source).toBe("ai")
    expect(sameTerm(alpha, withTextEdit(edited, { definition: "first" }))).toBe(true)
  })

  it("marks an AI term as yours only when it is saved with different text", () => {
    const [alpha, beta] = toRows(doc)
    const saved = fromRows(doc, [withTextEdit(alpha, { definition: "changed" }), beta])
    expect(saved.items[0]).toMatchObject({ definition: "changed", source: "manual" })
    expect(fromRows(doc, [{ ...alpha, pruned: true }, beta]).items[0].source).toBe("ai")
    expect(fromRows(doc, [withTextEdit(withTextEdit(alpha, { word: "x" }), { word: "alpha" }), beta]).items[0].source).toBe("ai")
  })

  it("tells pruning and restoring apart from edits", () => {
    const [alpha] = toRows(doc)
    expect(classifyTerm(alpha, { ...alpha, pruned: true })).toBe("pruned")
    expect(classifyTerm({ ...alpha, pruned: true }, alpha)).toBe("restored")
    expect(classifyTerm(alpha, { ...alpha, word: "a" })).toBe("edited")
  })

  it("compares only the fields a person can change", () => {
    const [alpha] = toRows(doc)
    expect(sameTerm(alpha, { ...alpha })).toBe(true)
    expect(sameTerm(alpha, { ...alpha, imageId: "img" })).toBe(false)
    expect(sameTerm(alpha, { ...alpha, source: "manual" })).toBe(false)
  })
})
