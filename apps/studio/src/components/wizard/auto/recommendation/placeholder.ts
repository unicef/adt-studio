/* eslint-disable lingui/no-unlocalized-strings -- placeholder recommender output: model-written reasons arrive already in the user's language */
import { getPdfPageCount } from "@/components/wizard/core/pdf/pdfMetadata"
import { readAspect } from "../loader/useBookAspect"
import type { SetupClient } from "./client"
import { setupResultSchema, type Decision, type Recommendation, type SetupRequest, type SetupResult } from "./contract"

export type Fixture = Pick<SetupResult, "provider" | "model" | "promptVersion" | "recommendation" | "usage" | "timing">

/**
 * The pages the recommender samples (adt-poc-llm `selectRepresentativePagePairs`): pages 1–N for short
 * books, otherwise 2…N−1 in consecutive pairs; with more than three pairs, the first, a middle and
 * the last one. Fixtures cite these so "based on pages …" matches what the backend would say. With a
 * chosen range the same rule runs inside it (the backend doesn't take a range yet).
 */
export function sampledPages(pageCount: number, range?: { start: number; end: number }): number[] {
  if (pageCount < 1) return []
  let first = pageCount >= 7 ? 2 : 1
  let last = pageCount >= 7 ? pageCount - 1 : pageCount
  if (range) {
    const start = Math.max(1, range.start)
    const end = Math.min(pageCount, range.end)
    first = Math.max(first, start)
    last = Math.min(last, end)
    if (first > last) [first, last] = [start, end]
  }
  const pairs: number[][] = []
  for (let page = first; page <= last; page += 2) pairs.push(page + 1 <= last ? [page, page + 1] : [page])
  const chosen = pairs.length > 3 ? [pairs[0], pairs[Math.round((pairs.length - 1) / 2)], pairs[pairs.length - 1]] : pairs
  return chosen.flat()
}

function d<T extends string>(choice: T, confidence: Decision["confidence"], reason: string, evidencePages: number[] = [], alternative: T | null = null, ambiguityReason: string | null = null) {
  return { choice, confidence, reason, alternative, ambiguityReason, evidencePages }
}

type Kind = "textbook" | "story-columns" | "colouring" | "reference" | "picture"

function kindOf(name: string): Kind {
  const n = name.toLowerCase()
  if (n.includes("matematica") || n.includes("cuaderno") || n.includes("alfabetizacao") || n.includes("egito")) return "textbook"
  if (n.includes("raven") || n.includes("hyena")) return "story-columns"
  if (n.includes("colouring")) return "colouring"
  if (n.includes("story") || n.includes("reimagining") || n.includes("reference")) return "reference"
  return "picture"
}

function recommendationFor(kind: Kind, spread: boolean, unsure: boolean, ev: number[]): Recommendation {
  const [a, b, c, e] = [ev.slice(0, 2), ev.slice(2, 4), ev.slice(-2), ev]
  if (kind === "textbook")
    return {
      preset: d("textbook", "high", "Lessons with numbered exercises, headings and short instructions on every sampled page.", e),
      renderStrategy: unsure
        ? d("llm", "medium", "Dense pages mixing exercises, tables and pictures read best when rebuilt for each screen.", a, "llm-overlay", "Several pages print the text directly on large illustrations, which an overlay would keep.")
        : d("llm", "high", "Dense pages mixing exercises, tables and pictures read best when rebuilt for each screen.", a),
      pageGrouping: d("single", "high", "Each page is a self-contained lesson; nothing runs across facing pages.", e),
      sectioningMode: d("dynamic", "medium", "Some pages hold several separate activities that are easier to follow apart.", b, "page", "Other pages are a single exercise, where page-level sections would be enough."),
      activitiesGenerator: d("enabled", "high", "Fill-in blanks, matching and multiple-choice items appear throughout.", e),
      figureExtraction: d("auto", "medium", "Diagrams and pictures sit next to the exercises they belong to.", b),
    }
  if (kind === "story-columns")
    return {
      preset: d("storybook", "high", "A short illustrated story with one or two sentences per page.", e),
      renderStrategy: unsure
        ? d("two_column_story", "medium", "Each page pairs one picture with a short block of text, which a picture-beside-text layout keeps tidy.", a, "fixed_layout", "Some pictures are framed with the text as one composition, which keeping the page as printed would preserve.")
        : d("two_column_story", "medium", "Each page pairs one picture with a short block of text, which a picture-beside-text layout keeps tidy.", a),
      pageGrouping: d("single", "high", "Illustrations stay within a single page.", e),
      sectioningMode: d("page", "high", "Every page is one short scene.", e),
      activitiesGenerator: d("disabled", "high", "No exercises or questions in the sampled pages.", e),
      figureExtraction: d("off", "medium", "Each page has a single illustration that can stay whole.", c),
    }
  if (kind === "colouring")
    return {
      preset: d("storybook", "high", "Large line drawings with very little text.", e),
      renderStrategy: unsure
        ? d("fixed_layout", "medium", "The drawings carry the page; keeping it as printed preserves them.", a, "llm-overlay", "The few lines of text sit inside the drawings and could be placed over them in readable boxes.")
        : d("fixed_layout", "high", "The drawings carry the page; keeping it as printed preserves them.", a),
      pageGrouping: d("spread", "medium", "Drawings continue across facing pages.", b),
      sectioningMode: d("page", "high", "Each page is a single picture.", e),
      activitiesGenerator: d("disabled", "medium", "Colouring prompts are not questions that can become interactive.", e),
      figureExtraction: d("off", "medium", "The drawings fill the page and should stay whole.", c),
    }
  if (kind === "reference")
    return {
      preset: d("reference", "high", "Mostly running text in sections, with few pictures.", e),
      renderStrategy: unsure
        ? d("single_column", "medium", "Long text reflows best as one column on any screen.", a, "llm", "Some sections mix text with diagrams and tables that a redesigned page could arrange better.")
        : d("single_column", "high", "Long text reflows best as one column on any screen.", a),
      pageGrouping: d("single", "high", "Pages are independent.", e),
      sectioningMode: d("page", "medium", "Pages are short and read top to bottom.", e),
      activitiesGenerator: d("disabled", "high", "No exercises in the sampled pages.", e),
      figureExtraction: d("auto", "low", "A few figures may need extracting; the sample shows little.", c),
    }
  return {
    preset: d("storybook", "high", "Big illustrations on every sampled page, with short passages of text.", e),
    renderStrategy: unsure
      ? d("fixed_layout", "medium", "The text is part of the artwork, so keeping each page as printed preserves it.", a, "llm-overlay", "The text sits on the illustrations, so placing it over the artwork in readable boxes would also work.")
      : d("fixed_layout", "high", "The text is part of the artwork, so keeping each page as printed preserves it.", a),
    pageGrouping: spread ? d("spread", "medium", "Several illustrations continue across facing pages.", b) : d("single", "high", "No illustration crosses into the facing page.", b),
    sectioningMode: d("page", "high", "Each page is a single scene.", e),
    activitiesGenerator: d("disabled", "high", "No exercises or questions in the sampled pages.", e),
    figureExtraction: d("off", "low", "Pictures are full-page artwork; there is little to extract.", c),
  }
}

/** Portrait picture books usually run their pictures across facing pages. */
const SPREAD_BELOW_ASPECT = 0.95

/** A plausible answer for a book, by the kind its file name suggests; `unsure` leaves the look between two options. */
export function fixtureFor(fileName: string, aspect: number | undefined, unsure: boolean, pageCount = 0, range?: { start: number; end: number }): Fixture {
  const kind = kindOf(fileName)
  const spread = aspect !== undefined && aspect < SPREAD_BELOW_ASPECT
  return {
    provider: "openai",
    model: "placeholder",
    promptVersion: "adt-config-recommender-poc-v1",
    recommendation: recommendationFor(kind, spread, unsure, sampledPages(pageCount, range)),
    usage: { inputTokens: 9120, outputTokens: 860, totalTokens: 9980 },
    timing: { analyzerMs: 900, evidencePreparationMs: 1400, inferenceMs: 1300, totalMs: 3600 },
  }
}

/** The placeholder's full answer to a request. */
export function placeholderResult(request: SetupRequest, aspect: number | undefined, unsure: boolean, pageCount: number): SetupResult {
  return { ...fixtureFor(request.file.name, aspect, unsure, pageCount, request.pages), userLanguage: request.userLanguage }
}

const ANSWER_MS = 2400

function wait(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const id = window.setTimeout(resolve, ms)
    signal.addEventListener("abort", () => {
      window.clearTimeout(id)
      reject(new DOMException("Aborted", "AbortError"))
    })
  })
}

/**
 * Stands in for the recommender until the API serves it (see ./README.md): answers in the
 * recommender's own shape, citing the pages it would sample, so the whole flow runs end to end.
 */
export const placeholderSetupClient: SetupClient = {
  async recommend(request, signal) {
    const [pageCount, aspect] = await Promise.all([getPdfPageCount(request.file).catch(() => 0), readAspect(request.file).catch(() => undefined), wait(ANSWER_MS, signal)])
    return setupResultSchema.parse(placeholderResult(request, aspect, false, pageCount))
  },
}
