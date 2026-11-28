import path from "node:path"
import { describe, expect, it } from "vitest"
import { createPromptEngine, type GenerateObjectOptions, type LLMModel, type Message } from "@adt/llm"
import type { BookProfile } from "@adt/pdf"
import { SetupRecommendation } from "@adt/types"
import { measureFacts } from "../setup-recommender/facts.js"
import { BOOK_FACT_OPTIONS } from "../setup-recommender/rules.js"
import { PAGE_LABELS_PROMPT, PAGE_TYPES, PLACEMENTS, QUESTIONS_PROMPT, readPageLabels, readQuestions } from "../setup-recommender/readings.js"
import { recommendSetup, type RecommendSetupOptions } from "../setup-recommender/recommend.js"

const promptsDir = path.join(process.cwd(), "prompts")
const engine = createPromptEngine(promptsDir)

/** A model that renders the prompt it is asked for (as the real one does) and answers with `answer`. */
function recordingModel(answer: (prompt: string) => unknown) {
  const calls: { prompt: string; messages: Message[]; log?: GenerateObjectOptions["log"] }[] = []
  const model = {
    generateObject: async (opts: GenerateObjectOptions) => {
      const messages = await engine.renderPrompt(opts.prompt!, opts.context ?? {})
      calls.push({ prompt: opts.prompt!, messages, log: opts.log })
      return { object: opts.schema.parse(answer(opts.prompt!)), usage: { inputTokens: 10, outputTokens: 2 } }
    },
  } as unknown as LLMModel
  return { model, calls }
}

const page = (n: number, text: string) => ({
  page: n,
  width: 500,
  height: 700,
  visibleChars: text.length,
  invisibleChars: 0,
  images: [],
  imageCoverage: 0.4,
  maxImageCoverage: 0.4,
  pathCount: 0,
  textOverImageChars: 0,
  ink: 0.2,
  text,
})
const profile: BookProfile = {
  pageCount: 8,
  language: null,
  producer: "test",
  pages: Array.from({ length: 8 }, (_, i) => page(i + 1, `Once upon a time on page ${i + 1}, the little fox ran into the woods.`)),
  edges: [],
  ms: 1,
}
const jpeg = (n: number) => new Uint8Array([0xff, 0xd8, n])
const imagesFor = (pages: number[]) => new Map(pages.map((n) => [n, jpeg(n)]))

const text = (m: Message) => (typeof m.content === "string" ? m.content : m.content.filter((p) => p.type === "text").map((p) => p.text).join("\n"))
const images = (m: Message) => (typeof m.content === "string" ? [] : m.content.filter((p) => p.type === "image"))

const labelsAnswer = { pages: Array.from({ length: 8 }, (_, i) => ({ page: i + 1, type: "story", textPlacement: "on-art", meaningfulFigure: false })), bookGenre: "story" }
const answer = (a: string, evidencePages: number[] = [2]) => ({ answer: a, confidence: "high", evidencePages, reason: "Seen on the pages." })
const questionsAnswer = { genre: answer("story"), exercises: answer("none"), composition: answer("text-in-art"), diagrams: answer("none"), language: "en-GB" }
const answerFor = (prompt: string) => (prompt === PAGE_LABELS_PROMPT ? labelsAnswer : questionsAnswer)

describe("setup recommender prompts", () => {
  it("asks the questions reading every question, with every answer it can take, and shows each page", async () => {
    const { model, calls } = recordingModel(answerFor)
    const reading = await readQuestions({ model, profile, facts: measureFacts(profile), images: imagesFor([2, 3, 4, 5, 6, 7]) })
    const [system, user] = calls[0].messages
    expect(calls[0].prompt).toBe(QUESTIONS_PROMPT)
    expect(calls[0].log?.promptName).toBe(QUESTIONS_PROMPT)
    expect(system.role).toBe("system")
    const body = text(user)
    for (const [fact, options] of Object.entries(BOOK_FACT_OPTIONS)) {
      expect(body).toContain(`${fact}: `)
      for (const option of options) expect(body).toContain(`- ${option}: `)
    }
    expect(body).toContain(`The book has 8 pages. You are shown pages ${reading.pages.join(", ")}.`)
    expect(body).toContain(`Text of page ${reading.pages[0]} (first 600 characters): Once upon a time`)
    expect(images(user)).toHaveLength(reading.pages.length)
    expect(reading.language).toBe("en-GB")
  })

  it("lists every page type and text placement for the page-label reading, and each page's text and image", async () => {
    const { model, calls } = recordingModel(answerFor)
    const reading = await readPageLabels({ model, profile, images: imagesFor([1, 2, 3, 4, 5, 6, 7, 8]) })
    const body = text(calls[0].messages[1])
    for (const id of [...PAGE_TYPES, ...PLACEMENTS]) expect(body).toContain(`- ${id}: `)
    expect(body).toContain("The book has 8 pages; every page is shown below, each as a small image")
    expect(body).toContain("Page 3: Text: Once upon a time on page 3")
    expect(images(calls[0].messages[1])).toHaveLength(8)
    expect(reading.labels).toHaveLength(8)
  })

  it("says the words-on-the-picture definitions the same way in both readings", async () => {
    const { model, calls } = recordingModel(answerFor)
    await readQuestions({ model, profile, facts: measureFacts(profile), images: new Map() })
    await readPageLabels({ model, profile, images: new Map() })
    const line = (body: string, start: string) => body.split("\n").find((l) => l.startsWith(start))!.slice(start.length)
    const [questions, labels] = calls.map((c) => text(c.messages[1]))
    expect(line(questions, "- text-in-art: ")).toBe(line(labels, "- on-art: "))
    expect(line(questions, "- text-beside-art: ")).toBe(line(labels, "- beside-art: "))
    expect(line(labels, "- on-art: ")).toMatch(/^On the picture\. The words sit inside the picture's area/)
    // A page that couldn't be drawn gets no "Page n:" label for an image.
    expect(images(calls[0].messages[1])).toHaveLength(0)
    expect(questions).not.toMatch(/^Page \d+:$/m)
  })
})

describe("recommendSetup", () => {
  it("draws both readings' pages in one call, and its answer fits the wire schema", async () => {
    const { model } = recordingModel(answerFor)
    const renders: { pages: number[]; size: number }[][] = []
    const renderPages: RecommendSetupOptions["renderPages"] = async (sets) => {
      renders.push(sets)
      return sets.map((s) => imagesFor(s.pages))
    }
    const rec = await recommendSetup({ id: "rec-1", model, modelId: "openai:test", profile, renderPages })
    expect(renders).toHaveLength(1)
    expect(renders[0].map((s) => s.size)).toEqual([512, 1000])
    expect(() => SetupRecommendation.parse(rec)).not.toThrow()
    expect(rec.secondOpinion).toBe(true)
    expect(rec.language).toEqual({ code: "en-GB", source: "ai" })
  })

  it("fails as a whole when a page can't be drawn, before any AI call", async () => {
    const { model, calls } = recordingModel(answerFor)
    const renderPages = async () => {
      throw new Error("page 9 is missing")
    }
    await expect(recommendSetup({ id: "rec-2", model, modelId: "openai:test", profile, renderPages })).rejects.toThrow("page 9 is missing")
    expect(calls).toHaveLength(0)
  })
})
