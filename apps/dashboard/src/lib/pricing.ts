export const PRICE_TIERS = ["short", "long"] as const
export type PriceTier = (typeof PRICE_TIERS)[number]

export interface ModelPrice {
  input: number
  output: number
  cachedInput: number | null
}

const price = (input: number, output: number, cachedInput: number | null = null): ModelPrice => ({ input, output, cachedInput })

export const MODEL_PRICES: Record<string, Partial<Record<PriceTier, ModelPrice>>> = {
  "gpt-6-astra": { short: price(10, 50, 1), long: price(20, 75, 2) },
  "gpt-6.1-sol": { short: price(2, 10, 0.1), long: price(4, 15, 0.2) },
  "gpt-6.1-terra": { short: price(1, 5, 0.05), long: price(2, 7.5, 0.1) },
  "gpt-6-luna": { short: price(0.1, 0.5, 0.01), long: price(0.2, 0.75, 0.02) },
  "gpt-6-sol": { long: price(4, 15, 0.4) },
  "gpt-5.6-sol": { long: price(8, 30, 0.8) },
  "gpt-5.6-terra": { long: price(4, 18, 0.4) },
  "gpt-5.6-luna": { long: price(0.4, 1.8, 0.04) },
  "gpt-5.5": { long: price(10, 45, 1) },
  "gpt-5.5-pro": { long: price(60, 270) },
  "gpt-5.4": { short: price(2.5, 15, 0.25), long: price(5, 22.5, 0.5) },
  "gpt-5.4-pro": { short: price(30, 180), long: price(60, 270) },
  "gpt-5.4-mini": { short: price(0.75, 4.5, 0.075), long: price(0.75, 4.5, 0.075) },
}

export const priceOf = (model: string, tier: PriceTier): ModelPrice | null => MODEL_PRICES[model]?.[tier] ?? null

export interface PricedTokens {
  model: string
  inputTokens: number
  outputTokens: number
  cachedInputTokens: number | null
}

export function callCost(call: PricedTokens, tier: PriceTier): number | null {
  const p = priceOf(call.model, tier)
  if (!p) return null
  const cached = p.cachedInput === null ? 0 : Math.min(call.cachedInputTokens ?? 0, call.inputTokens)
  return ((call.inputTokens - cached) * p.input + cached * (p.cachedInput ?? 0) + call.outputTokens * p.output) / 1_000_000
}

export const tierLabel = (tier: PriceTier) => (tier === "short" ? "short-context" : "long-context")
