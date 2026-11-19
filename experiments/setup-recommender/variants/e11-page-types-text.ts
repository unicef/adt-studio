/**
 * E11: E5 (label every page, count the labels) WITHOUT page images, for providers that take no images
 * and as a cheap second reading to cross-check E5. Each page gets its first 300 characters plus the
 * measured numbers that stand in for the picture: how much of the page is pictures, how many characters
 * sit on a picture, how many vector paths. Same labels, same counting (E5's aggregate), same rulebook.
 */
import { askJson } from "../llm.ts"
import { decide, type SemanticFacts } from "../rules.ts"
import { PAGE_TYPES, PLACEMENTS, aggregate, type PageLabel } from "./e5-page-types.ts"
import type { Variant } from "./types.ts"

export const e11PageTypesText: Variant = {
  id: "e11-page-types-text",
  label: "E5 without images: page labels from text + measured numbers",
  deterministic: false,
  async run(ctx) {
    const pages = ctx.book.pages.map((p) => p.page)
    const list = (o: Record<string, string>) => Object.entries(o).map(([k, v]) => `- ${k}: ${v}`).join("\n")
    const text = [
      `The book excerpt has ${pages.length} pages. You are NOT shown images. For every page you get measured numbers and its first 300 characters of text. "pictures" = share of the page covered by images; "chars on a picture" = visible characters that sit on top of a large image; "vector paths" = drawn lines and shapes (many paths plus short labels often means a diagram or chart).`,
      `Label each page.\n\nPage type:\n${list(PAGE_TYPES)}\n\nText placement:\n${list(PLACEMENTS)}\n\nmeaningfulFigure: true when the page has a diagram, chart, map, table, labelled figure or infographic whose labels carry meaning (not a plain photo or illustration).`,
      `Finally, bookGenre: what the whole book most likely is (story, textbook or reference), judging from everything shown, including what any preface says about the book.`,
      ...ctx.book.pages.map((p) =>
        `Page ${p.page}: pictures ${Math.round(p.imageCoverage * 100)}%, ${p.visibleChars} visible chars, ${p.textOverImageChars} chars on a picture, ${p.pathCount} vector paths, ${p.width > p.height * 1.2 ? "landscape" : "portrait"}. Text: ${p.text.slice(0, 300) || "(no text)"}`),
    ].join("\n\n")
    const res = await askJson<{ pages: PageLabel[]; bookGenre: SemanticFacts["genre"] }>({
      model: ctx.model,
      system: "You label the pages of a book one by one, judging each page on its own from its text and measurements. Then you give one guess for the whole book.",
      text,
      images: [],
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
