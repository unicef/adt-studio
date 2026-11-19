import { wrapLanguageModel, type LanguageModel, type LanguageModelV1Middleware } from "ai"

/**
 * Gemini 4 (Argon) ignores sampling parameters, which Google asks clients to
 * drop, and counts thinking tokens against `maxOutputTokens`, so the
 * pipeline's small per-step caps would be spent on thinking. Both are left
 * off the request and Google's own per-request limit applies (32,768 tokens
 * for a non-streaming call). Argon's 1M output is only reached by resending
 * with a continuation token, which this SDK cannot do. Stripped here because
 * AI SDK v4 sends `temperature: 0` when none is given.
 * https://ai.google.dev/gemini-api/docs/generate-content/latest-model
 */
const gemini4Middleware: LanguageModelV1Middleware = {
  transformParams: async ({ params }) => ({
    ...params,
    temperature: undefined,
    maxTokens: undefined,
  }),
}

export function isGemini4Model(modelId: string): boolean {
  return /^gemini-4([.-]|$)/i.test(modelId)
}

export function withGemini4Params(modelId: string, model: LanguageModel): LanguageModel {
  return isGemini4Model(modelId) ? wrapLanguageModel({ model, middleware: gemini4Middleware }) : model
}
