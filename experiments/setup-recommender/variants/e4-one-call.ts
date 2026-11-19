import { renderPages } from "../profile.ts"
import { choosePages, type Answers } from "../questions.ts"
import { decide, type SemanticFacts } from "../rules.ts"
import { askCombined } from "./one-call.ts"
import type { Variant, VariantContext } from "./types.ts"

export const semanticOf = (answers: Partial<Answers>, given: Partial<SemanticFacts> = {}) =>
  ({ ...Object.fromEntries(Object.entries(answers).map(([k, v]) => [k, v!.answer])), ...given }) as SemanticFacts

/** Facts the variant itself would put in front of the user: anything below high confidence. */
export const lowConfidence = (answers: Partial<Answers>) => Object.entries(answers).filter(([, v]) => v!.confidence !== "high").map(([k]) => k)

async function oneCall(ctx: VariantContext, withImages: boolean) {
  const pages = choosePages(ctx.book, ctx.facts)
  const images = withImages ? renderPages(ctx.buffer, pages) : undefined
  const res = await askCombined({ model: ctx.model, book: ctx.book, facts: ctx.facts, pages, images })
  const semantic = semanticOf(res.answers)
  return { settings: decide(ctx.facts, semantic), trace: { pages, answers: res.answers, semantic, flags: lowConfidence(res.answers) }, usage: { ...res.usage, calls: 1 }, ms: res.ms }
}

/** E4: E2's 4 questions in a single call. Same pages, same context, same rulebook. */
export const e4OneCall: Variant = {
  id: "e4-one-call",
  label: "E2's 4 questions in one call",
  deterministic: false,
  run: (ctx) => oneCall(ctx, true),
}

/** E6: E4 without page images: measurements + extracted text only (providers without image input). */
export const e6TextOnly: Variant = {
  id: "e6-text-only",
  label: "E4 without images (text + measurements)",
  deterministic: false,
  run: (ctx) => oneCall(ctx, false),
}
