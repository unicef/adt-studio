/**
 * Variant registry. To try a new approach: add a file in this folder that exports a Variant,
 * register it here, then `tsx run.ts <pdfs> <out> --variants <id>`.
 * E0 (Victor's PoC) runs outside this harness; `import-e0.ts` converts its outputs.
 */
import { e1Measure } from "./e1-measure.ts"
import { e2Facts, e3FactsDescription } from "./e2-facts.ts"
import type { Variant } from "./types.ts"

export const VARIANTS: Variant[] = [e1Measure, e2Facts, e3FactsDescription]
export type { Variant, VariantContext, VariantResult } from "./types.ts"
