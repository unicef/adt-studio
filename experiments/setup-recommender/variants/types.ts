import type { DeterministicFacts } from "../facts.ts"
import type { BookProfile } from "../profile.ts"
import type { Explained } from "../rules.ts"

/** Everything a variant gets for one book. Measurements are computed once and shared. */
export interface VariantContext {
  bookId: string
  buffer: Uint8Array
  book: BookProfile
  facts: DeterministicFacts
  model: string
  /** One-line description the person adding the book would type (simulated in the PoC set). */
  description?: string
  /** The true book facts (what an honest user would answer), for simulated user-in-the-loop variants only. */
  userFacts?: Partial<Record<string, string[]>>
}

export interface VariantResult {
  settings: Explained
  /** Whatever explains how the variant got there: answers, pages shown, prompts. */
  trace: unknown
  usage: { inputTokens: number; outputTokens: number; calls: number }
  ms: number
}

export interface Variant {
  id: string
  label: string
  /** Deterministic variants run once; LLM variants run N times to measure stability. */
  deterministic: boolean
  run(ctx: VariantContext): Promise<VariantResult>
}
