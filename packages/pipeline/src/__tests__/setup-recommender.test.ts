import { describe, expect, it } from "vitest"
import type { MeasuredFacts } from "../setup-recommender/facts.js"
import { decide, factMatters } from "../setup-recommender/rules.js"
import { countLabels, samplePlan, suggestRange, type PageLabel } from "../setup-recommender/readings.js"

const measured = (over: Partial<MeasuredFacts> = {}): MeasuredFacts => ({
  pageStorage: { value: "single-pages", evidence: [], seams: 0, pairs: 5, wideShare: 0 },
  textLayer: { value: "digital", evidence: [], scannedPages: 0, ocrPages: 0, pages: 10 },
  textOverPictures: { value: false, share: 0, evidence: [] },
  pictureHeavy: { value: false, medianCoverage: 0 },
  textDensity: { medianChars: 500, class: "medium" },
  vectorDiagrams: { value: false, pagesWithDiagrams: 0, evidence: [] },
  exerciseCues: { value: false, pagesWithCues: 0, evidence: [] },
  language: { pdfTag: null, guess: "en" },
  ...over,
})
const label = (page: number, type: PageLabel["type"], textPlacement: PageLabel["textPlacement"] = "beside-art"): PageLabel => ({
  page,
  type,
  textPlacement,
  meaningfulFigure: false,
})

describe("setup recommender rules", () => {
  it("keeps the printed page for a story with words on the pictures and a real text layer", () => {
    const d = decide(measured(), { genre: "story", exercises: "none", composition: "text-in-art", diagrams: "none" })
    expect(d.renderStrategy).toEqual({ value: "fixed_layout", rule: "render-keep-page" })
    expect(d.activitiesGenerator.value).toBe(false)
  })

  it("rebuilds the words over the page when a story with text on pictures has no text layer", () => {
    const d = decide(measured({ textLayer: { value: "scanned", evidence: [], scannedPages: 9, ocrPages: 0, pages: 10 } }), {
      genre: "story",
      exercises: "none",
      composition: "text-in-art",
      diagrams: "some",
    })
    expect(d.renderStrategy.value).toBe("llm-overlay")
    expect(d.figureExtraction).toEqual({ value: "off", rule: "figures-no-text-layer" })
  })

  it("turns activities on only for school books with exercises", () => {
    const school = decide(measured(), { genre: "textbook", exercises: "some", composition: "text-beside-art", diagrams: "none" })
    expect(school.activitiesGenerator.value).toBe(true)
    expect(school.sectioningMode.value).toBe("dynamic")
    const story = decide(measured(), { genre: "story", exercises: "some", composition: "text-beside-art", diagrams: "none" })
    expect(story.activitiesGenerator).toEqual({ value: false, rule: "activities-not-in-preset" })
  })

  it("joins facing pages only when pictures run across the gutter", () => {
    const m = measured({ pageStorage: { value: "spreads-as-separate-pages", evidence: [2, 3], seams: 4, pairs: 5, wideShare: 0 } })
    expect(decide(m, { genre: "story", exercises: "none", composition: "text-in-art", diagrams: "none" }).pageGrouping.value).toBe("spread")
  })

  it("says a fact matters only when another answer changes a setting", () => {
    const m = measured({ vectorDiagrams: { value: true, pagesWithDiagrams: 5, evidence: [] } })
    const facts = { genre: "textbook", exercises: "some", composition: "text-beside-art", diagrams: "none" } as const
    // Measured diagrams already turn figures on, so the diagrams answer can't change anything.
    expect(factMatters(m, facts, "diagrams")).toBe(false)
    expect(factMatters(m, facts, "genre")).toBe(true)
  })
})

describe("page labels", () => {
  it("counts the book's kind from body pages only and flags close calls", () => {
    const labels = [label(1, "cover"), label(2, "front-matter"), label(3, "story"), label(4, "story"), label(5, "exercise")]
    const { facts, flags } = countLabels(labels, "story")
    expect(facts.genre).toBe("story")
    expect(facts.exercises).toBe("some")
    expect(flags).not.toContain("genre")
  })

  it("falls back to the whole-book guess and flags it when fewer than two body pages were read", () => {
    const { facts, flags } = countLabels([label(1, "cover"), label(2, "front-matter"), label(3, "front-matter")], "textbook")
    expect(facts.genre).toBe("textbook")
    expect(flags).toContain("genre")
  })

  it("suggests the pages of the book itself", () => {
    const labels = [label(1, "cover"), label(2, "front-matter"), label(3, "story"), label(4, "story"), label(5, "story"), label(6, "back-matter")]
    expect(suggestRange(labels, 6)).toMatchObject({ keepCover: true, start: 3, end: 5, startExact: true, endExact: true })
  })

  it("reads short books in full and long books on a bounded sample", () => {
    expect(samplePlan(30)).toMatchObject({ full: true })
    const plan = samplePlan(400)
    expect(plan.full).toBe(false)
    expect(plan.all.length).toBeLessThanOrEqual(40)
    expect(plan.all.at(-1)).toBe(400)
  })
})
