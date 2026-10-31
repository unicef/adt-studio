import { DEFAULT_ELEVENLABS_TTS_MODEL_ID, DEFAULT_OPENAI_TTS_MODEL_ID, speechModelProvider } from "@adt/types"

/** Each provider's built-in speech model — must match the pipeline's defaults in `speech.ts`. */
export const DEFAULT_TTS_MODEL: Record<string, string> = {
  openai: DEFAULT_OPENAI_TTS_MODEL_ID,
  azure: "azure-tts",
  gemini: "gemini-2.5-flash-preview-tts",
  elevenlabs: DEFAULT_ELEVENLABS_TTS_MODEL_ID,
}

/**
 * The model the Speech summary names — mirrors the pipeline's
 * resolveSpeechModel(): the per-provider model first, then the global id
 * (`speech.model`, else Settings → Models) only when it belongs to this
 * provider, else the provider's built-in default. An id of unknown shape
 * still passes through for OpenAI.
 */
export function summarySpeechModel(
  provider: string,
  speechConfig: { model?: unknown; providers?: Record<string, { model?: unknown } | undefined> },
  globalDefault: string | undefined,
): string {
  const providerModel = speechConfig.providers?.[provider]?.model
  if (typeof providerModel === "string" && providerModel.trim()) return providerModel.trim()

  const providerDefault = provider === "openai" ? undefined : DEFAULT_TTS_MODEL[provider]
  const bookModel = typeof speechConfig.model === "string" ? speechConfig.model : undefined
  const globalModel = (bookModel ?? globalDefault)?.trim()
  if (globalModel) {
    const owner = speechModelProvider(globalModel)
    if (owner === provider || (owner === undefined && providerDefault === undefined)) {
      return globalModel
    }
  }
  return providerDefault ?? DEFAULT_TTS_MODEL.openai
}
