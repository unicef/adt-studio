import { describe, expect, it } from "vitest"
import type { BookProfile } from "@adt/pdf"
import { measureFacts, type MeasuredFacts } from "../setup-recommender/facts.js"
import { decide, factMatters, type BookFacts } from "../setup-recommender/rules.js"
import { bookLanguage, breakTies, factEvidence, factQuestions } from "../setup-recommender/recommend.js"
import { countLabels, languageCode, PLACEMENTS, PLAIN_QUESTIONS, readPageLabels, samplePlan, suggestRange, type PageLabel } from "../setup-recommender/readings.js"
import type { LLMModel } from "@adt/llm"

const measured = (over: Partial<MeasuredFacts> = {}): MeasuredFacts => ({
  pageStorage: { value: "single-pages", via: null, evidence: [], seams: 0, pairs: 5, wideShare: 0 },
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
    const cues = { value: true, pagesWithCues: 5, evidence: [] }
    const school = decide(measured({ exerciseCues: cues }), { genre: "textbook", exercises: "some", composition: "text-beside-art", diagrams: "none" })
    expect(school.activitiesGenerator.value).toBe(true)
    expect(school.sectioningMode.value).toBe("dynamic")
    const story = decide(measured(), { genre: "story", exercises: "some", composition: "text-beside-art", diagrams: "none" })
    expect(story.activitiesGenerator).toEqual({ value: false, rule: "activities-not-in-preset" })
  })

  it("keeps activities off for a school book whose few tasks the measured cues don't confirm (build-it projects)", () => {
    const facts: BookFacts = { genre: "textbook", exercises: "some", composition: "text-mostly", diagrams: "some" }
    const d = decide(measured(), facts)
    expect(d.activitiesGenerator).toEqual({ value: false, rule: "activities-few-cues" })
    // The preset decides the sections, not the exercises.
    expect(d.sectioningMode).toEqual({ value: "dynamic", rule: "sections-split" })
    // "many" exercises, or pages with too few words to count cues on, still turn them on.
    expect(decide(measured(), { ...facts, exercises: "many" }).activitiesGenerator.value).toBe(true)
    expect(decide(measured({ textDensity: { medianChars: 0, class: "sparse" } }), facts).activitiesGenerator.value).toBe(true)
    const scan = measured({ textLayer: { value: "scanned", evidence: [], scannedPages: 9, ocrPages: 0, pages: 10 } })
    expect(decide(scan, facts).activitiesGenerator.value).toBe(true)
  })

  it("splits every school book into sections, with or without exercises", () => {
    const d = decide(measured(), { genre: "textbook", exercises: "none", composition: "text-mostly", diagrams: "none" })
    expect(d.sectioningMode).toEqual({ value: "dynamic", rule: "sections-school-book" })
    expect(d.activitiesGenerator).toEqual({ value: false, rule: "activities-none" })
  })

  it("rebuilds the words over the page for a scanned story with words beside the pictures", () => {
    const scan = measured({ textLayer: { value: "scanned", evidence: [], scannedPages: 9, ocrPages: 0, pages: 10 } })
    const d = decide(scan, { genre: "story", exercises: "none", composition: "text-beside-art", diagrams: "none" })
    expect(d.renderStrategy).toEqual({ value: "llm-overlay", rule: "render-overlay-no-text-beside" })
  })

  it("reads the words directly in a mixed book when most pages have a real text layer", () => {
    const mixed = (scannedPages: number) => measured({ textLayer: { value: "mixed", evidence: [], scannedPages, ocrPages: scannedPages, pages: 100 } })
    const facts: BookFacts = { genre: "story", exercises: "none", composition: "text-in-art", diagrams: "none" }
    expect(decide(mixed(20), facts).renderStrategy.value).toBe("fixed_layout")
    expect(decide(mixed(60), facts).renderStrategy.value).toBe("llm-overlay")
  })

  it("joins facing pages only when pictures run across the gutter", () => {
    const m = measured({ pageStorage: { value: "spreads-as-separate-pages", via: "joined-pictures", evidence: [2, 3], seams: 4, pairs: 5, wideShare: 0 } })
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

describe("ask policy", () => {
  it("doesn't ask when the second opinion leads to the same settings", () => {
    const m = measured({ exerciseCues: { value: true, pagesWithCues: 30, evidence: [] } })
    const proposal: BookFacts = { genre: "textbook", exercises: "some", composition: "text-mostly", diagrams: "many" }
    // "some" against "many" diagrams: Figures stays Auto either way.
    const q = factQuestions(m, proposal, { ...proposal, diagrams: "some" }, false)
    expect(q.find((f) => f.id === "diagrams")).toMatchObject({ matters: true, askReason: null })
    // "some" against "none" diagrams (with no drawn diagrams measured) turns Figures off: asked.
    const q2 = factQuestions(m, proposal, { ...proposal, diagrams: "none" }, false)
    expect(q2.find((f) => f.id === "diagrams")?.askReason).toBe("readings-disagree")
  })

  it("asks about a fact that only matters under the other reading's kind of book", () => {
    const proposal: BookFacts = { genre: "story", exercises: "none", composition: "text-beside-art", diagrams: "none" }
    const second: BookFacts = { genre: "textbook", exercises: "many", composition: "text-beside-art", diagrams: "none" }
    const q = factQuestions(measured(), proposal, second, false)
    // Under Storybook exercises change nothing; under School book they turn activities on.
    expect(factMatters(measured(), proposal, "exercises")).toBe(false)
    expect(q.find((f) => f.id === "exercises")).toMatchObject({ matters: true, askReason: "readings-disagree" })
    expect(q.find((f) => f.id === "genre")?.askReason).toBe("readings-disagree")
  })

  it("asks every fact that matters when only one reading came back", () => {
    const proposal: BookFacts = { genre: "textbook", exercises: "some", composition: "text-mostly", diagrams: "none" }
    const one = factQuestions(measured(), proposal, null, false, true)
    for (const f of one) expect(f.askReason).toBe(f.matters ? "one-reading" : null)
    expect(one.some((f) => f.askReason === "one-reading")).toBe(true)
    // Replaying a saved run without a second reading (oneReading not set) keeps the old policy.
    expect(factQuestions(measured(), proposal, null, false).every((f) => f.askReason === null)).toBe(true)
  })
})

describe("page labels reading", () => {
  it("keeps one label per page, and only pages that were sent", async () => {
    const profile = { pageCount: 4, pages: [1, 2, 3, 4].map((page) => ({ page, text: `page ${page}` })) } as unknown as BookProfile
    const story = (page: number) => ({ page, type: "story", textPlacement: "beside-art", meaningfulFigure: false })
    const model = {
      generateObject: async () => ({
        object: { pages: [story(1), story(2), { ...story(2), type: "exercise" }, story(3), story(4), story(9)], bookGenre: "story" },
        usage: { inputTokens: 1, outputTokens: 1 },
      }),
    } as unknown as LLMModel
    const reading = await readPageLabels({ model, profile, renderPages: () => new Map() })
    expect(reading.labels.map((l) => [l.page, l.type])).toEqual([[1, "story"], [2, "story"], [3, "story"], [4, "story"]])
    expect(reading.counts.body).toBe(4)
  })
})

describe("evidence", () => {
  it("shows measured diagram pages only when drawn diagrams were measured", () => {
    const off = measured({ vectorDiagrams: { value: false, pagesWithDiagrams: 1, evidence: [7] } })
    expect(factEvidence("diagrams", "some", [], null, off)).not.toContain(7)
    const on = measured({ vectorDiagrams: { value: true, pagesWithDiagrams: 6, evidence: [7] } })
    expect(factEvidence("diagrams", "some", [], null, on)).toContain(7)
  })
})

describe("page labels", () => {
  it("breaks a tie on where the words sit with the questions reading's answer", () => {
    const labels = [label(1, "story", "on-art"), label(2, "story", "on-art"), label(3, "story", "beside-art"), label(4, "story", "beside-art")]
    const counted = countLabels(labels, "story")
    expect(counted.flags).toContain("composition")
    expect(counted.ties.composition?.sort()).toEqual(["text-beside-art", "text-in-art"])
    const q = (composition: BookFacts["composition"]) => ({ facts: { ...counted.facts, composition } })
    expect(breakTies(counted, q("text-beside-art")).composition).toBe("text-beside-art")
    expect(breakTies(counted, q("text-in-art")).composition).toBe("text-in-art")
    // An answer outside the tie leaves the labels' pick; the readings then disagree and the fact is asked.
    expect(breakTies(counted, q("text-mostly")).composition).toBe(counted.facts.composition)
  })

  it("defines words on the picture the same way in both readings", () => {
    expect(PLACEMENTS["on-art"]).toBe(PLAIN_QUESTIONS.composition.options["text-in-art"])
    expect(PLACEMENTS["beside-art"]).toBe(PLAIN_QUESTIONS.composition.options["text-beside-art"])
  })

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

// T = a page of text, P = a full picture with no text, - = neither (title, mixed page).
function bookOf(kinds: string): BookProfile {
  const flat = Array.from({ length: 48 }, () => 250)
  const pages = [...kinds].map((k, i) => ({
    page: i + 1,
    width: 500,
    height: 700,
    visibleChars: k === "T" ? 600 : k === "P" ? 0 : 60,
    invisibleChars: 0,
    images: [],
    imageCoverage: k === "P" ? 1 : k === "-" ? 0.4 : 0,
    maxImageCoverage: k === "P" ? 1 : k === "-" ? 0.4 : 0,
    pathCount: 0,
    textOverImageChars: 0,
    ink: k === "P" ? 0.8 : 0.1,
    text: "",
  }))
  const edges = pages.map((p) => ({ pageNumber: p.page, leftEdge: flat, rightEdge: flat, textLength: p.visibleChars, textNearLeftEdge: 0, textNearRightEdge: 0 }))
  return { pageCount: pages.length, language: "en", producer: "", pages, edges, ms: 0 }
}

describe("text layer", () => {
  it("doesn't call a long digital book mixed for two scanned pages with OCR", () => {
    const b = bookOf("T".repeat(40))
    for (const n of [5, 20]) Object.assign(b.pages[n], { visibleChars: 0, invisibleChars: 500, imageCoverage: 1, maxImageCoverage: 1 })
    expect(measureFacts(b).textLayer.value).toBe("digital")
    for (const n of [6, 7, 8, 21]) Object.assign(b.pages[n], { visibleChars: 0, invisibleChars: 500, imageCoverage: 1, maxImageCoverage: 1 })
    expect(measureFacts(b).textLayer.value).toBe("mixed")
  })
})

describe("split spreads", () => {
  it("finds two-page openings where a text page faces a picture page", () => {
    // Openings start on even pages and the text side switches: 2-3, 4-5, ...
    const m = measureFacts(bookOf("P" + "TPPTTPPTTPPTTPPTTPPT" + "-"))
    expect(m.pageStorage).toMatchObject({ value: "spreads-as-separate-pages", via: "text-facing-picture" })
    expect(decide(m, { genre: "story", exercises: "none", composition: "text-beside-art", diagrams: "none" }).pageGrouping).toEqual({
      value: "spread",
      rule: "group-facing-pages",
    })
  })

  it("can't tell openings apart when text and pictures simply alternate", () => {
    // T P T P ...: every pair on both sides of the fold is text + picture, so nothing marks the openings.
    expect(measureFacts(bookOf("P" + "TP".repeat(10) + "-")).pageStorage.value).toBe("single-pages")
  })

  it("keeps single pages for a text book with an occasional full-page picture", () => {
    expect(measureFacts(bookOf("P" + "TTTPTTTTTTPTTTTTTTPTTTTT" + "-")).pageStorage.value).toBe("single-pages")
  })
})

describe("book language", () => {
  it("reads a two-letter code from the model's answer", () => {
    expect(languageCode("pt")).toBe("pt")
    expect(languageCode(" ES ")).toBe("es")
    expect(languageCode("pt-BR")).toBe("pt")
    expect(languageCode("none")).toBeNull()
    expect(languageCode("Portuguese")).toBeNull()
    expect(languageCode(undefined)).toBeNull()
  })

  it("prefers the AI, then the text guess, then the PDF tag", () => {
    expect(bookLanguage("sq", { pdfTag: "en-US", guess: "en" })).toEqual({ code: "sq", source: "ai" })
    expect(bookLanguage(null, { pdfTag: "en-US", guess: "es" })).toEqual({ code: "es", source: "text" })
    expect(bookLanguage(null, { pdfTag: "en-US", guess: null })).toEqual({ code: "en", source: "pdf-tag" })
    expect(bookLanguage(null, { pdfTag: null, guess: null })).toEqual({ code: null, source: null })
  })
})
