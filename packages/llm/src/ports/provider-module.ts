import type { z } from "zod"
import type {
  AgentCapabilities,
  AiModality,
  ImageCapabilities,
  ProviderManifest,
  SttCapabilities,
  StructuredTextCapabilities,
  TtsCapabilities,
} from "@adt/types"
import type {
  BackendContext,
  BackendFactory,
  CacheFingerprint,
  ConnectionCheckContext,
  DiscoveredModel,
  ModelListContext,
  ProviderConnectionStatus,
  ProviderCredentialValues,
} from "./common.js"
import type { StructuredTextBackend } from "./structured-text-backend.js"
import type { AgentBackend } from "./agent-backend.js"
import type { ImageBackend } from "./image-backend.js"
import type { SpeechSynthesizer, Transcriber } from "./speech-backend.js"

export interface ModalityCapabilities {
  "structured-text": StructuredTextCapabilities
  agent: AgentCapabilities
  image: ImageCapabilities
  tts: TtsCapabilities
  stt: SttCapabilities
}

export type CapabilitiesFor<M extends AiModality> = ModalityCapabilities[M]

/** Never serialized — `manifest` is the only piece that crosses an HTTP boundary. */
/** A CLI sign-in started from Studio; the CLI owns the tokens it receives. */
export interface CliLoginSession {
  /** Sign-in page, for when the CLI could not open the browser itself. Absent when nothing is left to do. */
  url?: string
  /** Settles when the CLI reports the login finished; rejects with the CLI's own message. */
  completion: Promise<void>
  /** Abort the waiting CLI process. */
  cancel: () => void
}

export interface CliLoginPort<C extends ProviderCredentialValues = ProviderCredentialValues> {
  start(context: ConnectionCheckContext<C>): Promise<CliLoginSession>
  logout(context: ConnectionCheckContext<C>): Promise<void>
}

export interface ProviderModule<
  C extends ProviderCredentialValues = ProviderCredentialValues,
> {
  manifest: ProviderManifest

  credentialSchema: z.ZodType<C, z.ZodTypeDef, unknown>

  resolveServerCredentials?: () => Partial<Record<string, string>>

  /** Returning undefined falls back to the manifest's declared capabilities. */
  capabilitiesFor?: <M extends AiModality>(
    modality: M,
    modelId: string,
    credentials: C,
  ) => CapabilitiesFor<M> | undefined

  /** Non-secret identity of the concrete backend; must never contain a secret. */
  cacheFingerprint: (context: BackendContext<C>) => CacheFingerprint

  /**
   * Optional live model catalogue. Advisory only — the result powers UI
   * suggestions and never becomes the authority for model validation. Should
   * throw `ModelDiscoveryError` for a reachable-but-failed attempt.
   */
  listModels?: (context: ModelListContext<C>) => Promise<DiscoveredModel[]>

  /**
   * Optional live connection check. Providers that can verify reachability more
   * cheaply than `listModels` (or without any HTTP call at all, like a local CLI
   * login) implement this; everyone else falls back to discovery. `detail` must
   * never carry a secret, not even a masked one.
   */
  checkConnection?: (
    context: ConnectionCheckContext<C>,
  ) => Promise<ProviderConnectionStatus>

  /**
   * Optional Studio-driven sign-in for CLI-backed providers, so nobody has to
   * open a terminal. The port only starts and observes the CLI's own login
   * flow; credentials stay in the CLI's files and never pass through the ADT.
   */
  cliLogin?: CliLoginPort<C>

  createStructuredTextBackend?: BackendFactory<StructuredTextBackend, C>
  createAgentBackend?: BackendFactory<AgentBackend, C>
  createImageBackend?: BackendFactory<ImageBackend, C>
  createSpeechSynthesizer?: BackendFactory<SpeechSynthesizer, C>
  createTranscriber?: BackendFactory<Transcriber, C>
}

export type AnyProviderModule = ProviderModule<any>

export const MODALITY_FACTORY_KEYS = {
  "structured-text": "createStructuredTextBackend",
  agent: "createAgentBackend",
  image: "createImageBackend",
  tts: "createSpeechSynthesizer",
  stt: "createTranscriber",
} as const satisfies Record<AiModality, keyof AnyProviderModule>
