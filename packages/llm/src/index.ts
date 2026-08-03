export type {
  LLMModel,
  GenerateObjectOptions,
  GenerateObjectResult,
  Message,
  ContentPart,
  TextPart,
  ImagePart,
  TokenUsage,
  ValidationResult,
} from "./types.js"

export { createLLMModel, type CreateLLMModelOptions } from "./client.js"

export {
  generateImageWithCache,
  type GenerateImageWithCacheOptions,
  type GenerateImageWithCacheResult,
} from "./image.js"

export { computeHash, readCache, writeCache, bustCache } from "./cache.js"

export {
  sanitizeMessages,
  imageDimensions,
  pngDimensions,
  type LlmLogEntry,
  type LlmLogMessage,
  type LlmLogImagePlaceholder,
} from "./log.js"

export {
  createPromptEngine,
  renderLiquidTemplate,
  resolvePromptModelId,
  promptModelFolderName,
  promptNameForModel,
  type PromptEngine,
  type PromptRenderOptions,
  type PromptResolution,
} from "./prompt.js"

export {
  createRateLimiter,
  createAdaptiveRateLimiter,
  type RateLimiter,
  type AdaptiveRateLimiter,
  type AdaptiveRateLimiterOptions,
} from "./rate-limiter.js"

export { createLogger, type LogLevel, type Logger } from "./logger.js"

export {
  DEFAULT_OLLAMA_BASE_URL,
  ollamaOpenAIBaseUrl,
  resolveOllamaModelName,
} from "./ollama.js"

export {
  isEmbeddedLocalModelId,
  isLocalModelId,
  localLlmOpenAIBaseUrl,
} from "./local.js"

export {
  createTTSSynthesizer,
  createAzureTTSSynthesizer,
  createGeminiTTSSynthesizer,
  transcribeWithWhisper,
  type TTSSynthesizer,
  type SynthesizeSpeechOptions,
  type AzureTTSConfig,
  type AzureAudioOptions,
  type GeminiTTSConfig,
  type WhisperWordTimestamp,
  type WhisperTranscriptionResult,
} from "./speech.js"

export {
  DEFAULT_KOKORO_MODEL,
  DEFAULT_KOKORO_VOICE,
  KOKORO_SUPPORTED_LANGUAGES,
  KOKORO_VOICES,
  normalizeHfModelSource,
  localHfModelDirectory,
  readLocalHfManifest,
  isKokoroLanguageSupported,
  createLocalHfTTSSynthesizer,
  encodePcm16Wav,
  clearLocalHfTTSRuntimeCache,
  type LocalHfModelManifest,
  type LocalHfTTSDtype,
  type LocalHfTTSConfig,
  type LocalHfTTSSynthesizer,
} from "./local-speech.js"
