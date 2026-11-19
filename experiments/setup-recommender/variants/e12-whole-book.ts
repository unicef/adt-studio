/**
 * E12: E5 (label pages, count the labels) for WHOLE books. E5 sends every page; on a 400-page book that is
 * too slow to render and upload. E12 labels a fixed sample instead:
 *   - the opening: the first max(10, 6% of pages) pages, capped at 24, so the "where does the book start"
 *     boundary is inside the labelled pages for most books;
 *   - the end: the last 4 pages (credits, index, back cover);
 *   - the middle: 10 pages spread evenly between them.
 * Books of 30 pages or fewer are labelled in full, so on the PoC excerpts E12 = E5 (same prompt, same counting).
 * Counting is E5's `aggregate` unchanged. The labels also give a suggested page range (`suggestRange`):
 * keep the cover, start at the first page of the book itself, stop after its last page.
 * e12t-sampled-text is the same sample without images (E11's per-page numbers instead): a cheap second
 * reading and the path for providers without image input.
 */
import { askJson } from "../llm.ts"
import { renderPages, type BookProfile } from "../profile.ts"
import { decide, type SemanticFacts } from "../rules.ts"
import { PAGE_TYPES, PLACEMENTS, aggregate, type PageLabel } from "./e5-page-types.ts"
import type { Variant, VariantContext } from "./types.ts"
import { choosePages } from "../questions.ts"
import { makePlainWords } from "./e10-plain-words.ts"

export interface SamplePlan { opening: number[]; middle: number[]; end: number[]; all: number[]; full: boolean }

export function samplePlan(pageCount: number): SamplePlan {
  const range = (a: number, b: number) => Array.from({ length: Math.max(0, b - a + 1) }, (_, i) => a + i)
  if (pageCount <= 30) return { opening: [], middle: range(1, pageCount), end: [], all: range(1, pageCount), full: true }
  const openN = Math.min(24, Math.max(10, Math.round(pageCount * 0.06)))
  const opening = range(1, openN)
  const end = range(pageCount - 3, pageCount)
  const lo = openN + 1, hi = pageCount - 4
  const middle = [...new Set(Array.from({ length: 10 }, (_, i) => Math.round(lo + ((i + 0.5) * (hi - lo)) / 10)))]
  return { opening, middle, end, all: [...opening, ...middle, ...end], full: false }
}

const BODY = ["story", "lesson", "exercise", "informational"]
/**
 * Suggested pages to import, from the labels. Start = first labelled body page followed by another body page
 * (an isolated "What are volcanoes?" inside the cover does not start the book). End = last body page.
 * The cover is kept. Returns null when no two body pages were seen (El Viaje).
 */
export function suggestRange(labels: PageLabel[], pageCount: number) {
  const sorted = [...labels].sort((a, b) => a.page - b.page)
  const isBody = (l?: PageLabel) => !!l && BODY.includes(l.type)
  const startIdx = sorted.findIndex((l, i) => isBody(l) && isBody(sorted[i + 1]))
  if (startIdx < 0) return null
  let endIdx = sorted.length - 1
  while (endIdx > startIdx && !isBody(sorted[endIdx])) endIdx--
  const start = sorted[startIdx].page
  const last = sorted[endIdx].page
  // The end boundary is only known when the page after it was labelled too; otherwise keep to the last page.
  const next = sorted[endIdx + 1]
  // Not adjacent (a whole-book sample): when the labelled pages after the last body page run without a gap to
  // the end of the PDF, at least those are end pages; the true end may be earlier (endExact false).
  const tail = sorted.slice(endIdx + 1)
  const tailRunsToEnd = tail.length > 0 && tail.at(-1)!.page === pageCount && tail.every((l, i) => i === 0 || l.page === tail[i - 1].page + 1)
  const end = next && next.page === last + 1 ? last : tailRunsToEnd ? tail[0].page - 1 : pageCount
  const cover = sorted[0]?.page === 1 && sorted[0].type === "cover" ? 1 : null
  const skipStart = cover ? [2, start - 1] : [1, start - 1]
  return {
    keepCover: cover !== null,
    start,
    end,
    skipped: [
      ...(skipStart[1] >= skipStart[0] ? [{ from: skipStart[0], to: skipStart[1], why: "opening" as const }] : []),
      ...(end < pageCount ? [{ from: end + 1, to: pageCount, why: "end" as const }] : []),
    ],
    /** The start is exact only if the page before it was labelled too. */
    startExact: start === 1 || sorted.some((l) => l.page === start - 1),
    endExact: tail.length === 0 || next.page === last + 1,
  }
}

async function labelPages(ctx: VariantContext, plan: SamplePlan, withImages: boolean, format: "png" | "jpeg" = "png") {
  const pages = plan.all
  const byPage = new Map(ctx.book.pages.map((p) => [p.page, p]))
  const list = (o: Record<string, string>) => Object.entries(o).map(([k, v]) => `- ${k}: ${v}`).join("\n")
  const shown = plan.full
    ? `The book has ${ctx.book.pageCount} pages; every page is shown below`
    : `The book has ${ctx.book.pageCount} pages. You are shown ${pages.length} of them: the first ${plan.opening.length}, ${plan.middle.length} spread through the middle, and the last ${plan.end.length}`
  const how = withImages
    ? "each as a small image with its first 300 characters of text."
    : `You are NOT shown images. For every page you get measured numbers and its first 300 characters of text. "pictures" = share of the page covered by images; "chars on a picture" = visible characters that sit on top of a large image; "vector paths" = drawn lines and shapes.`
  const pageText = (n: number) => {
    const p = byPage.get(n)!
    const nums = withImages ? "" : `pictures ${Math.round(p.imageCoverage * 100)}%, ${p.visibleChars} visible chars, ${p.textOverImageChars} chars on a picture, ${p.pathCount} vector paths. `
    return `Page ${n}: ${nums}Text: ${p.text.slice(0, 300) || "(no text)"}`
  }
  const text = [
    `${shown}, ${how}`,
    `Label each page shown.\n\nPage type:\n${list(PAGE_TYPES)}\n\nText placement:\n${list(PLACEMENTS)}\n\nmeaningfulFigure: true when the page has a diagram, chart, map, table, labelled figure or infographic whose labels carry meaning (not a plain photo or illustration).`,
    `Finally, bookGenre: what the whole book most likely is (story, textbook or reference), judging from everything shown.`,
    ...pages.map(pageText),
  ].join("\n\n")
  const images = withImages ? renderPages(ctx.buffer, pages, 512, format) : null
  const res = await askJson<{ pages: PageLabel[]; bookGenre: SemanticFacts["genre"] }>({
    model: ctx.model,
    system: "You label the pages of a book one by one, judging each page on its own. Then you give one guess for the whole book.",
    text,
    images: images ? pages.map((p) => ({ label: `Page ${p}:`, png: images.get(p)! })) : [],
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
  const uploadBytes = images ? [...images.values()].reduce((s, png) => s + Math.ceil((png.length * 4) / 3), 0) + text.length : text.length
  return { res, uploadBytes }
}

function make(id: string, label: string, withImages: boolean, format: "png" | "jpeg" = "png"): Variant {
  return {
    id,
    label,
    deterministic: false,
    async run(ctx) {
      const plan = samplePlan(ctx.book.pageCount)
      const started = performance.now()
      const { res, uploadBytes } = await labelPages(ctx, plan, withImages, format)
      const agg = aggregate(res.value.pages, res.value.bookGenre)
      return {
        settings: decide(ctx.facts, agg.semantic),
        trace: {
          plan, pageLabels: res.value.pages, bookGenre: res.value.bookGenre, semantic: agg.semantic, flags: agg.flags, counts: agg.counts,
          range: suggestRange(res.value.pages, ctx.book.pageCount), uploadBytes, llmMs: res.ms, renderAndCallMs: performance.now() - started,
        },
        usage: { ...res.usage, calls: 1 },
        ms: performance.now() - started,
      }
    },
  }
}

export const e12Sampled = make("e12-sampled", "E5 on a fixed page sample (opening, middle, end) for whole books", true)
/** Round 3, slow links: E12 with the same 512 px pages sent as JPEG (quality 70) instead of PNG. Low detail either way. */
export const e12SampledJpeg = make("e12j-sampled-jpeg", "E12 with JPEG pages (5x smaller upload on picture books)", true, "jpeg")
export const e12SampledText = make("e12t-sampled-text", "E12 without images (E11's per-page numbers)", false)

/** For callers that have a profile but no run: the plan the variant would use. */
export const planFor = (b: BookProfile) => samplePlan(b.pageCount)

/**
 * E13: E10 (plain-words questions, 6 page images) reading 6 pages spread through the book's middle, not
 * E4's chooser (which starts at page 2 and, on a whole picture book, picked 4 opening pages and the back
 * cover). Meant as the "different way of reading" check for E12 on whole books. On books of 30 pages or
 * fewer it is E10 unchanged.
 */
export const e13PlainWordsMiddle = makePlainWords(
  "e13-plain-words-middle",
  "E10 reading 6 pages from the middle of the book (whole-book check for E12)",
  (ctx) => e13Pages(ctx),
)
function e13Pages(ctx: VariantContext) {
  const plan = samplePlan(ctx.book.pageCount)
  if (plan.full) return choosePages(ctx.book, ctx.facts)
  const m = plan.middle
  return [0, 2, 4, 5, 7, 9].map((i) => m[Math.min(i, m.length - 1)]).filter((p, i, a) => a.indexOf(p) === i)
}

/** Round 3, slow links: E13 with 512 px JPEG pages at low detail (about 0.3 MB instead of 1-4 MB). */
export const e14MiddleLite = makePlainWords(
  "e14-middle-lite",
  "E13 with small JPEG pages at low detail (slow links)",
  (ctx) => e13Pages(ctx),
  { size: 512, format: "jpeg", detail: "low" },
)
