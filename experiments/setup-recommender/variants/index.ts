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
import { e9DescribeRich, e9DescribeShort, e9DescribeVague } from "./e9-describe-first.ts"
import { e10PlainWords } from "./e10-plain-words.ts"
import { e11PageTypesText } from "./e11-page-types-text.ts"
import { e12Sampled, e12SampledJpeg, e12SampledText, e13PlainWordsMiddle, e14MiddleLite } from "./e12-whole-book.ts"
import type { Variant } from "./types.ts"

export const VARIANTS: Variant[] = [e1Measure, e2Facts, e3FactsDescription, e4OneCall, e5PageTypes, e6TextOnly, e7Bagged, e8GenreFirst, e9DescribeShort, e9DescribeVague, e9DescribeRich, e10PlainWords, e11PageTypesText, e12Sampled, e12SampledText, e13PlainWordsMiddle, e12SampledJpeg, e14MiddleLite]
export type { Variant, VariantContext, VariantResult } from "./types.ts"
