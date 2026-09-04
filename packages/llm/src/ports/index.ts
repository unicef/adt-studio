export {
  AiProviderError,
  type AiProviderErrorDetails,
  type CredentialValidationIssue,
} from "./errors.js"

export type {
  BackendContext,
  BackendFactory,
  CacheFingerprint,
  ConnectionCheckContext,
  DiscoveredModel,
  ModelListContext,
  ProviderConnectionStatus,
  ProviderCredentialValues,
  TokenUsage,
} from "./common.js"

export type {
  StructuredTextBackend,
  StructuredTextRequest,
  StructuredTextResult,
  StructuredRequestTraits,
} from "./structured-text-backend.js"

export {
  defineAgentTool,
  type AgentBackend,
  type AgentMessage,
  type AgentRunResult,
  type AgentTool,
  type AgentToolCall,
  type AgentToolDefinition,
  type AgentToolResult,
  type AgentToolSet,
  type AgentTurn,
  type AgentTurnRequest,
  type AgentTurnResponse,
} from "./agent-backend.js"

export type {
  ImageBackend,
  ImageEditRequest,
  ImageGenerateRequest,
  ImageReference,
  ImageResult,
} from "./image-backend.js"

export type {
  SpeechResult,
  SpeechSynthesisRequest,
  SpeechSynthesizer,
  Transcriber,
  TranscriptionRequest,
  TranscriptionResult,
  WordTimestamp,
} from "./speech-backend.js"

export {
  MODALITY_FACTORY_KEYS,
  type AnyProviderModule,
  type CapabilitiesFor,
  type ModalityCapabilities,
  type ProviderModule,
  type CliLoginPort,
  type CliLoginSession,
} from "./provider-module.js"
