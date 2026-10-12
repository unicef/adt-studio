import type { TokenUsage } from "./types.js"

/** Missing/partial SDK usage is unknown, never a measured zero-token call. */
export function knownTokenUsage(usage: Partial<TokenUsage> | undefined): TokenUsage | undefined {
  const { inputTokens, outputTokens } = usage ?? {}
  if (
    typeof inputTokens !== "number" ||
    typeof outputTokens !== "number" ||
    !Number.isFinite(inputTokens) ||
    !Number.isFinite(outputTokens) ||
    inputTokens < 0 ||
    outputTokens < 0
  )
    return undefined
  return { inputTokens, outputTokens }
}
