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
  mergeResolvedCredentials,
  toResolvedCredentials,
  type LLMProviderCredentials,
} from "./legacy-credentials.js"

export { formatProviderError } from "./error-format.js"

export {
  generateImageWithCache,
  type GenerateImageWithCacheOptions,
  type GenerateImageWithCacheResult,
} from "./image.js"

export {
  computeHash,
  computeCacheHash,
  readCache,
  writeCache,
  bustCache,
} from "./cache.js"

export {
  runAgentLoop,
  type AgentLogContext,
  type RunAgentLoopOptions,
} from "./agent-loop.js"

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
  type CreatePromptEngineOptions,
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

export * from "./ports/index.js"

export {
  createProviderRegistry,
  type ListModelsOptions,
  type MutableProviderRegistry,
  type ProviderRegistry,
  type ResolveOptions,
  type ResolvedBackend,
} from "./registry.js"

export {
  discoverModels,
  ModelDiscoveryError,
} from "./model-discovery.js"

export {
  checkProviderConnection,
  type CheckProviderConnectionOptions,
} from "./provider-health.js"

export {
  assertModelCredentials,
  describeMissingModelCredential,
} from "./credential-checks.js"

export {
  assertConfigModels,
  collectConfigModelChecks,
  validateConfigModels,
  type ConfigModelCheck,
  type ConfigModelIssue,
} from "./config-validation.js"

export {
  credentialValue,
  describeCredentialPresence,
  extractCredentialsFromHeaders,
  isProviderConfiguredOnServer,
  mergeWithServerCredentials,
  providerFieldStatus,
  resolveProviderCredentials,
  validateProviderCredentials,
  type HeaderReader,
  type ResolvedCredentials,
} from "./credentials.js"

export {
  assertSupportedModel,
  isSupportedModel,
  isValidModelId,
  normalizeModelId,
  parseModelId,
  providerIdOf,
  qualifyModelId,
  resolveModelIdFor,
  safeParseModelId,
  sanitizeModelIdForPath,
  type ParsedModelId,
} from "./model-id.js"

export {
  BUILT_IN_PROVIDERS,
  createDefaultProviderRegistry,
  getDefaultProviderRegistry,
  ANTHROPIC_PROVIDER_ID,
  AZURE_PROVIDER_ID,
  CLAUDE_AGENT_PROVIDER_ID,
  CODEX_PROVIDER_ID,
  CUSTOM_PROVIDER_ID,
  GEMINI_PROVIDER_ID,
  GOOGLE_PROVIDER_ID,
  OLLAMA_DEFAULT_BASE_URL,
  OLLAMA_PROVIDER_ID,
  OPENAI_PROVIDER_ID,
  anthropicManifest,
  anthropicProvider,
  azureManifest,
  azureProvider,
  claudeAgentManifest,
  claudeAgentProvider,
  codexManifest,
  codexProvider,
  customManifest,
  customProvider,
  geminiManifest,
  geminiProvider,
  googleManifest,
  googleProvider,
  ollamaManifest,
  ollamaProvider,
  openaiManifest,
  openaiProvider,
} from "./providers/index.js"

export {
  EndpointUrl,
  redactUrl,
  validateEndpointUrl,
} from "./providers/shared/endpoint.js"
