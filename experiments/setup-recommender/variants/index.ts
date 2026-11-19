/**
 * Variant registry. To try a new approach: add a file in this folder that exports a Variant,
 * register it here, then `tsx run.ts <pdfs> <out> --variants <id>`.
 * E0 (Victor's PoC) runs outside this harness; `import-e0.ts` converts its outputs.
 */
import { e1Measure } from "./e1-measure.ts"
import { e2Facts, e3FactsDescription } from "./e2-facts.ts"
import { e4OneCall, e6TextOnly } from "./e4-one-call.ts"
import { e5PageTypes } from "./e5-page-types.ts"
import { e7Bagged } from "./e7-bagged.ts"
import { e8GenreFirst } from "./e8-genre-first.ts"
import type { Variant } from "./types.ts"

export const VARIANTS: Variant[] = [e1Measure, e2Facts, e3FactsDescription, e4OneCall, e5PageTypes, e6TextOnly, e7Bagged, e8GenreFirst]
export type { Variant, VariantContext, VariantResult } from "./types.ts"
