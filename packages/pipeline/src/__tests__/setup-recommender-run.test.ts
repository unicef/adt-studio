import { describe, expect, it } from "vitest"
import type { BookProfile } from "@adt/pdf"
import type { LLMModel } from "@adt/llm"
import { recommendSetup } from "../setup-recommender/recommend.js"
import { PAGE_LABELS_PROMPT } from "../setup-recommender/readings.js"

// A 10-page digital textbook: plain text pages, no pictures, no edges to join.
const profile: BookProfile = {
  pageCount: 10,
  language: "en",
  producer: "test",
  ms: 1,
  pages: Array.from({ length: 10 }, (_, i) => ({
    page: i + 1,
    width: 595,
    height: 842,
    visibleChars: 1200,
    invisibleChars: 0,
    images: [],
    imageCoverage: 0,
    maxImageCoverage: 0,
    pathCount: 0,
    textOverImageChars: 0,
    ink: 0.1,
    text: "The water cycle. Water evaporates from the sea and the lakes, rises and cools into clouds, then falls as rain. ".repeat(10),
  })),
  edges: Array.from({ length: 10 }, (_, i) => ({ pageNumber: i + 1, leftEdge: [], rightEdge: [], textLength: 1200, textNearLeftEdge: 0, textNearRightEdge: 0 })),
}

const answer = (value: string) => ({ answer: value, confidence: "high", evidencePages: [3], reason: "As the pages show." })
const QUESTIONS = { genre: answer("textbook"), exercises: answer("none"), composition: answer("text-mostly"), diagrams: answer("none"), language: "en" }
const LABELS = {
  pages: Array.from({ length: 10 }, (_, i) => ({ page: i + 1, type: i === 0 ? "cover" : "lesson", textPlacement: "text-only", meaningfulFigure: false })),
  bookGenre: "textbook",
}

/** A model that answers each reading, or fails the ones named in `fail`. */
function fakeModel(fail: ("labels" | "questions")[] = []): LLMModel {
  return {
    generateObject: async (opts: { log?: { promptName?: string } }) => {
      const which = opts.log?.promptName === PAGE_LABELS_PROMPT ? "labels" : "questions"
      if (fail.includes(which)) throw new Error(`${which} reading failed: HTTP 500 from the provider`)
      return { object: which === "labels" ? LABELS : QUESTIONS, usage: { inputTokens: 10, outputTokens: 5 } }
    },
  } as unknown as LLMModel
}

const run = (fail: ("labels" | "questions")[] = []) =>
  recommendSetup({ id: "t", model: fakeModel(fail), modelId: "fake:model", profile, renderPages: async (sets) => sets.map(() => new Map()) })

describe("recommendSetup", () => {
  it("uses both readings and asks nothing when they agree", async () => {
    const rec = await run()
    expect(rec.secondOpinion).toBe(true)
    expect(rec.settings.preset.value).toBe("textbook")
    expect(rec.facts.filter((f) => f.ask)).toEqual([])
    expect(rec.readings?.errors).toBeUndefined()
    expect(rec.usage.calls).toBe(2)
  })

  it("asks every fact that matters, and records why, when the page labels fail", async () => {
    const rec = await run(["labels"])
    expect(rec.secondOpinion).toBe(false)
    expect(rec.readings?.labels).toBeNull()
    expect(rec.readings?.errors?.labels).toContain("labels reading failed")
    const asked = rec.facts.filter((f) => f.ask)
    expect(asked.length).toBeGreaterThan(0)
    for (const f of rec.facts) expect(f.askReason).toBe(f.matters ? "one-reading" : null)
  })

  it("records why when the questions fail", async () => {
    const rec = await run(["questions"])
    expect(rec.secondOpinion).toBe(false)
    expect(rec.readings?.errors?.questions).toContain("questions reading failed")
    expect(rec.facts.some((f) => f.askReason === "one-reading")).toBe(true)
  })

  it("fails when both readings fail", async () => {
    await expect(run(["labels", "questions"])).rejects.toThrow("labels reading failed")
  })
})
