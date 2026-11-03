import { describe, expect, it } from "vitest"
import { AuthoredContent } from "../content-authorship.js"
import { OutputSource } from "../output-freshness.js"
import { TextCatalogEntry } from "../text-catalog.js"
import { Quiz } from "../quiz.js"
import { PageSectioningOutput } from "../page-sectioning.js"
import { TocGenerationOutput } from "../toc.js"

const quiz = {
  quizId: "qz017", quizIndex: 0, afterPageId: "pg001", pageIds: ["pg001"],
  question: "How many?", options: [
    { text: "One", explanation: "First" },
    { text: "Two", explanation: "Second" },
    { text: "Three", explanation: "Third" },
  ], answerIndex: 1, reasoning: "Counting",
}

describe("content authorship", () => {
  it("does not infer AI authorship or review acceptance for legacy content", () => {
    expect(AuthoredContent.parse({})).toEqual({})
    expect(AuthoredContent.parse({ inputSignature: "known", accepted: true })).toEqual({})
    expect(OutputSource.safeParse("reviewed").success).toBe(false)
  })

  const cases = [
    { name: "translation entry", schema: TextCatalogEntry, value: { id: "pg001_t001", text: "Bonjour" } },
    { name: "individual quiz", schema: Quiz, value: quiz },
    { name: "empty page record", schema: PageSectioningOutput, value: { reasoning: "Deleted last section", sections: [] } },
    { name: "TOC document", schema: TocGenerationOutput, value: { entries: [], pageCount: 1, generatedAt: "2026-10-10" } },
  ]

  for (const { name, schema, value } of cases) {
    it(`${name}: reads a legacy record without adding provenance`, () => {
      expect(schema.parse(value)).toEqual(value)
      expect(Object.hasOwn(schema.parse(value), "source")).toBe(false)
    })
    it.each(["ai", "manual"])(`${name}: retains %s authorship on a JSON round trip`, (source) => {
      const stored = { ...value, source }
      expect(schema.parse(JSON.parse(JSON.stringify(stored)))).toEqual(stored)
    })
    it(`${name}: rejects invalid authorship instead of treating it as AI`, () => {
      for (const source of [null, "unknown", "accepted", "AI", 1]) {
        expect(schema.safeParse({ ...value, source }).success).toBe(false)
      }
    })
  }

  it("protects a whole TOC or page, not individual positional entries/sections", () => {
    const toc = TocGenerationOutput.parse({
      source: "manual", generatedAt: "2026-10-10", pageCount: 1,
      entries: [{ id: "toc_001", title: "Chapter", sectionId: "pg001_sec001", href: "pg001_sec001.html", chapterId: "ch1", level: 1, source: "ai" }],
    })
    const page = PageSectioningOutput.parse({
      source: "manual", reasoning: "Edited", sections: [{
        sectionId: "pg001_sec001", sectionType: "text", backgroundColor: "white",
        textColor: "black", pageNumber: 1, isPruned: false, nodes: [], source: "ai",
      }],
    })
    expect(toc.source).toBe("manual")
    expect(toc.entries[0]).not.toHaveProperty("source")
    expect(page.source).toBe("manual")
    expect(page.sections[0]).not.toHaveProperty("source")
  })
})

it("requires an editor version and defaults protected replacement off", async () => {
  const { AuthoredSaveGuard, AuthoredRunOptions } = await import("../content-authorship.js")
  expect(AuthoredSaveGuard.safeParse({}).success).toBe(false)
  expect(AuthoredSaveGuard.safeParse({ baseVersion: -1 }).success).toBe(false)
  expect(AuthoredSaveGuard.parse({ baseVersion: 0 })).toEqual({ baseVersion: 0 })
  expect(AuthoredRunOptions.parse({})).toEqual({ replaceManual: false, protectedReplacements: [] })
  expect(AuthoredRunOptions.safeParse({ replaceManual: true, protectedReplacements: [{ node: "toc-generation", itemId: "book", version: 0 }] }).success).toBe(false)
})
