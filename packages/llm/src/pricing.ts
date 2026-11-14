import type { TokenUsage } from "./types.js"

/**
 * List prices in USD per million tokens, keyed by the full `provider:model`
 * id. Only models whose price is recorded in this repository's issues appear
 * here; an unlisted model estimates to `null` rather than a guess, and callers
 * report its tokens as unpriced. Verify against the provider's pricing page
 * before relying on a figure.
 */
export interface ModelPrice {
  inputPerMillion: number
  outputPerMillion: number
}

export const MODEL_PRICES: Record<string, ModelPrice> = {
  // #919: GPT-5.4 $2.50 / $15, GPT-6.1 Sol $2 / $10 (standard short context).
  "openai:gpt-5.4": { inputPerMillion: 2.5, outputPerMillion: 15 },
  "openai:gpt-6.1-sol": { inputPerMillion: 2, outputPerMillion: 10 },
}

/** Strip a dated snapshot suffix (`-2026-03-01`) so snapshots share a price. */
function priceKey(modelId: string): string {
  return modelId.replace(/-\d{4}-\d{2}-\d{2}$/, "")
}

/** Estimated USD for `usage` on `modelId`, or `null` when the model is unpriced. */
export function estimateCost(modelId: string, usage: TokenUsage): number | null {
  const price = MODEL_PRICES[priceKey(modelId)]
  if (!price) return null
  return (usage.inputTokens * price.inputPerMillion + usage.outputTokens * price.outputPerMillion) / 1_000_000
}
