import { decide, guessSemanticFacts } from "../rules.ts"
import type { Variant } from "./types.ts"

/** E1: measurements only, no LLM. The semantic facts are guessed from the numbers. */
export const e1Measure: Variant = {
  id: "e1-measure",
  label: "Measurements only, no AI",
  deterministic: true,
  async run(ctx) {
    const started = performance.now()
    const semantic = guessSemanticFacts(ctx.facts)
    return { settings: decide(ctx.facts, semantic), trace: { semantic }, usage: { inputTokens: 0, outputTokens: 0, calls: 0 }, ms: performance.now() - started }
  },
}
