import { renderPages } from "../profile.ts"
import { askAll, choosePages } from "../questions.ts"
import { decide, type SemanticFacts } from "../rules.ts"
import type { Variant, VariantContext } from "./types.ts"

async function factsThenRules(ctx: VariantContext, description?: string) {
  const pages = choosePages(ctx.book, ctx.facts)
  const images = renderPages(ctx.buffer, pages)
  const res = await askAll({ model: ctx.model, book: ctx.book, facts: ctx.facts, images, description })
  const semantic = Object.fromEntries(Object.entries(res.answers).map(([k, v]) => [k, v.answer])) as unknown as SemanticFacts
  return { settings: decide(ctx.facts, semantic), trace: { pages, answers: res.answers }, usage: { ...res.usage, calls: 4 }, ms: res.ms }
}

/** E2: measurements + 4 plain questions to the LLM (one call each), then the rulebook. */
export const e2Facts: Variant = {
  id: "e2-facts",
  label: "Measurements + AI answers 4 questions + rules",
  deterministic: false,
  run: (ctx) => factsThenRules(ctx),
}

/** E3: E2 with the user's one-line description added to every question as a hint. */
export const e3FactsDescription: Variant = {
  id: "e3-facts-description",
  label: "E2 + the user's one-line description as a hint",
  deterministic: false,
  run: (ctx) => factsThenRules(ctx, ctx.description),
}
