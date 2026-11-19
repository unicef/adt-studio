import { askJson } from "../llm.ts"
import { renderPages } from "../profile.ts"
import { decide, type SemanticFacts } from "../rules.ts"
import type { Variant } from "./types.ts"

/**
 * E5: per-page classification, then counting. One call sees EVERY page as a small low-detail image
 * plus its first 300 characters and labels each page with a page type, where the text sits, and
 * whether it has a meaningful figure. Book facts are counted from the page labels with fixed rules
 * (thresholds below were written before the first run and not changed after):
 *   - cover / front matter / back matter / blank pages do not vote;
 *   - fewer than 2 voting pages -> the genre comes from the model's whole-book guess and is flagged;
 *   - genre = most common of story / (lesson+exercise) / informational; flagged below 60% or on a tie;
 *   - exercises: 0 exercise pages none, under half some, else many;
 *   - composition = most common text placement among voting pages with text; flagged below 60%;
 *   - diagrams: 0 none, under a third some, else many.
 * Idea: a few odd pages (a preface, a credits page) cannot drag the whole book, and the page counts
 * are something the user can check ("6 story pages, 2 front-matter pages").
 */
const PAGE_TYPES = {
  cover: "Front or back cover.",
  "front-matter": "Title page, copyright, contents, or a preface, foreword or introduction written about the book by its author, editor or publisher.",
  story: "Narrative: tells a story (fiction or tale), as prose or as text with illustrations.",
  lesson: "Teaches a topic to learners: explanations, examples, worked content addressed to students.",
  exercise: "Tasks for the reader to do: questions to answer, blanks, matching, circling, writing.",
  informational: "Factual or academic prose read for information, not a lesson: article, paper, report, manual.",
  "back-matter": "Credits, licence, index, glossary, about the author, list of other titles.",
  blank: "Empty or nearly empty page, or a picture with no text that does not carry a story.",
} as const
const PLACEMENTS = {
  "on-art": "The text is placed on top of a picture that fills most of the page.",
  "beside-art": "The text sits in its own area next to, above or below a picture.",
  "text-only": "Mostly text; pictures small or absent.",
  "no-text": "No readable text.",
} as const
type PageType = keyof typeof PAGE_TYPES
type Placement = keyof typeof PLACEMENTS
type PageLabel = { page: number; type: PageType; textPlacement: Placement; meaningfulFigure: boolean }
const NON_VOTING: PageType[] = ["cover", "front-matter", "back-matter", "blank"]

export function aggregate(labels: PageLabel[], bookGuess: SemanticFacts["genre"]) {
  const body = labels.filter((l) => !NON_VOTING.includes(l.type))
  const flags: string[] = []
  const argmax = (m: Record<string, number>) => {
    const e = Object.entries(m).sort((a, b) => b[1] - a[1])
    return { key: e[0][0], share: e[0][1] / Math.max(1, e.reduce((s, x) => s + x[1], 0)), tie: e.length > 1 && e[0][1] === e[1][1] }
  }
  let genre: SemanticFacts["genre"]
  const genreCounts = {
    story: body.filter((l) => l.type === "story").length,
    textbook: body.filter((l) => l.type === "lesson" || l.type === "exercise").length,
    reference: body.filter((l) => l.type === "informational").length,
  }
  if (body.length < 2) { genre = bookGuess; flags.push("genre") }
  else {
    const g = argmax(genreCounts)
    genre = g.tie ? bookGuess : (g.key as SemanticFacts["genre"])
    if (g.tie || g.share < 0.6) flags.push("genre")
  }
  const ex = body.filter((l) => l.type === "exercise").length
  const exercises: SemanticFacts["exercises"] = ex === 0 ? "none" : ex < body.length / 2 ? "some" : "many"
  // No voting page has text (an excerpt of front matter only): fall back to every page with text.
  const hasText = (l: PageLabel) => l.textPlacement !== "no-text"
  const withText = body.some(hasText) ? body.filter(hasText) : labels.filter((l) => l.type !== "cover" && hasText(l))
  const placeCounts = { "on-art": 0, "beside-art": 0, "text-only": 0 } as Record<string, number>
  for (const l of withText) placeCounts[l.textPlacement]++
  const pl = argmax(placeCounts)
  if (withText.length === 0 || pl.tie || pl.share < 0.6) flags.push("composition")
  const composition = ({ "on-art": "text-in-art", "beside-art": "text-beside-art", "text-only": "text-mostly" } as const)[pl.key as "on-art"]
  const fig = body.filter((l) => l.meaningfulFigure).length
  const diagrams: SemanticFacts["diagrams"] = fig === 0 ? "none" : fig < body.length / 3 ? "some" : "many"
  return { semantic: { genre, exercises, composition, diagrams } as SemanticFacts, flags, counts: { body: body.length, ...genreCounts, exercisePages: ex, figurePages: fig, placement: placeCounts } }
}

export const e5PageTypes: Variant = {
  id: "e5-page-types",
  label: "AI labels every page, facts are counted from the labels",
  deterministic: false,
  async run(ctx) {
    const pages = ctx.book.pages.map((p) => p.page)
    const images = renderPages(ctx.buffer, pages, 512)
    const list = (o: Record<string, string>) => Object.entries(o).map(([k, v]) => `- ${k}: ${v}`).join("\n")
    const text = [
      `The book excerpt has ${pages.length} pages; every page is shown below as a small image with its first 300 characters of text.`,
      `Label each page.\n\nPage type:\n${list(PAGE_TYPES)}\n\nText placement:\n${list(PLACEMENTS)}\n\nmeaningfulFigure: true when the page has a diagram, chart, map, table, labelled figure or infographic whose labels carry meaning (not a plain photo or illustration).`,
      `Finally, bookGenre: what the whole book most likely is (story, textbook or reference), judging from everything shown, including what any preface says about the book.`,
      ...ctx.book.pages.map((p) => `Text of page ${p.page}: ${p.text.slice(0, 300) || "(no text)"}`),
    ].join("\n\n")
    const res = await askJson<{ pages: PageLabel[]; bookGenre: SemanticFacts["genre"] }>({
      model: ctx.model,
      system: "You label the pages of a book one by one, judging each page on its own. Then you give one guess for the whole book.",
      text,
      images: pages.map((p) => ({ label: `Page ${p}:`, png: images.get(p)! })),
      detail: "low",
      schemaName: "page_labels",
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["pages", "bookGenre"],
        properties: {
          pages: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["page", "type", "textPlacement", "meaningfulFigure"],
              properties: {
                page: { type: "integer", enum: pages },
                type: { type: "string", enum: Object.keys(PAGE_TYPES) },
                textPlacement: { type: "string", enum: Object.keys(PLACEMENTS) },
                meaningfulFigure: { type: "boolean" },
              },
            },
          },
          bookGenre: { type: "string", enum: ["story", "textbook", "reference"] },
        },
      },
    })
    const agg = aggregate(res.value.pages, res.value.bookGenre)
    return {
      settings: decide(ctx.facts, agg.semantic),
      trace: { pageLabels: res.value.pages, bookGenre: res.value.bookGenre, semantic: agg.semantic, flags: agg.flags, counts: agg.counts },
      usage: { ...res.usage, calls: 1 },
      ms: res.ms,
    }
  },
}
