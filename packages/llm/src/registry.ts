import {
  safeParseModelId,
  type AiModality,
  type ProviderDescriptor,
  type ProviderManifest,
  ProviderManifest as ProviderManifestSchema,
} from "@adt/types"
import {
  AiProviderError,
  MODALITY_FACTORY_KEYS,
  type AgentBackend,
  type AnyProviderModule,
  type BackendContext,
  type CacheFingerprint,
  type CapabilitiesFor,
  type DiscoveredModel,
  type ImageBackend,
  type ModelListContext,
  type SpeechSynthesizer,
  type StructuredTextBackend,
  type Transcriber,
} from "./ports/index.js"
import {
  isProviderConfiguredOnServer,
  providerFieldStatus,
  resolveProviderCredentials,
  type ResolvedCredentials,
} from "./credentials.js"
import type { LogLevel } from "./logger.js"

export interface ResolveOptions {
  credentials?: ResolvedCredentials
  logLevel?: LogLevel
}

export interface ListModelsOptions extends ResolveOptions {
  /** Best-effort filter; models without declared modalities always pass through. */
  modality?: AiModality
  signal?: AbortSignal
}

export interface ResolvedBackend<B, M extends AiModality> {
  providerId: string
  /** Provider-scoped model id, case preserved. */
  modelId: string
  /** Canonical `providerId:modelId`. */
  qualifiedModelId: string
  modality: M
  backend: B
  capabilities: CapabilitiesFor<M>
  fingerprint: CacheFingerprint
}

export interface ProviderRegistry {
  readonly ids: readonly string[]
  has(providerId: string): boolean
  tryGet(providerId: string): AnyProviderModule | undefined
  get(providerId: string): AnyProviderModule
  /** Registration order; used by generic credential extraction. */
  modules(): AnyProviderModule[]
  manifests(): ProviderManifest[]
  descriptors(): ProviderDescriptor[]
  supports(providerId: string, modality: AiModality): boolean
  providersFor(modality: AiModality): AnyProviderModule[]
  /** True when the provider implements a live model catalogue (advisory only). */
  supportsModelDiscovery(providerId: string): boolean
  /**
   * Advisory live model list. Never an authority for validation — callers must
   * still route selected ids through `safeParseModelId` and capability
   * resolution. Throws `ModelDiscoveryError` for a reachable-but-failed attempt.
   */
  listModels(providerId: string, options?: ListModelsOptions): Promise<DiscoveredModel[]>
  /** Declared (manifest-level) capabilities; model-specific resolution needs credentials. */
  declaredCapabilities<M extends AiModality>(
    providerId: string,
    modality: M,
  ): CapabilitiesFor<M> | undefined
  capabilities<M extends AiModality>(
    modality: M,
    rawModelId: string,
    options?: ResolveOptions,
  ): CapabilitiesFor<M>
  /** Default model id for a modality, from the provider's manifest. */
  defaultModelFor(providerId: string, modality: AiModality): string | undefined

  resolveStructuredText(
    rawModelId: string,
    options?: ResolveOptions,
  ): ResolvedBackend<StructuredTextBackend, "structured-text">
  resolveAgent(
    rawModelId: string,
    options?: ResolveOptions,
  ): ResolvedBackend<AgentBackend, "agent">
  resolveImage(
    rawModelId: string,
    options?: ResolveOptions,
  ): ResolvedBackend<ImageBackend, "image">
  resolveSpeechSynthesizer(
    rawModelId: string,
    options?: ResolveOptions,
  ): ResolvedBackend<SpeechSynthesizer, "tts">
  resolveTranscriber(
    rawModelId: string,
    options?: ResolveOptions,
  ): ResolvedBackend<Transcriber, "stt">
}

export interface MutableProviderRegistry extends ProviderRegistry {
  register(module: AnyProviderModule): MutableProviderRegistry
  freeze(): ProviderRegistry
}

export function createProviderRegistry(): MutableProviderRegistry {
  const modules = new Map<string, AnyProviderModule>()
  let frozen = false

  const assertMutable = (): void => {
    if (frozen) {
      throw new Error("Provider registry is frozen; register providers during bootstrap")
    }
  }

  const get = (providerId: string): AnyProviderModule => {
    const module = modules.get(providerId)
    if (!module) throw AiProviderError.unknownProvider(providerId, [...modules.keys()])
    return module
  }

  const supports = (providerId: string, modality: AiModality): boolean => {
    const module = modules.get(providerId)
    if (!module) return false
    return (
      module.manifest.modalities.includes(modality) &&
      typeof module[MODALITY_FACTORY_KEYS[modality]] === "function"
    )
  }

  const parse = (rawModelId: string): { providerId: string; modelId: string; qualified: string } => {
    const parsed = safeParseModelId(rawModelId)
    if (!parsed.ok) throw AiProviderError.invalidModelId(rawModelId, parsed.error)
    return parsed.value
  }

  const buildContext = <M extends AiModality>(
    modality: M,
    rawModelId: string,
    options: ResolveOptions,
  ): {
    module: AnyProviderModule
    context: BackendContext<any>
    capabilities: CapabilitiesFor<M>
    qualified: string
  } => {
    const { providerId, modelId, qualified } = parse(rawModelId)
    const module = get(providerId)

    if (!module.manifest.modalities.includes(modality)) {
      throw AiProviderError.unsupportedModality(providerId, modality)
    }
    if (typeof module[MODALITY_FACTORY_KEYS[modality]] !== "function") {
      throw AiProviderError.unsupportedModality(providerId, modality)
    }

    const credentials = resolveProviderCredentials(module, options.credentials)
    const context: BackendContext<any> = {
      providerId,
      modelId,
      modality,
      credentials,
      logLevel: options.logLevel,
    }

    const resolved =
      module.capabilitiesFor?.(modality, modelId, credentials) ??
      (module.manifest.capabilities[modality] as CapabilitiesFor<M> | undefined)
    if (!resolved) {
      throw AiProviderError.unsupportedModality(providerId, modality)
    }

    return { module, context, capabilities: resolved, qualified }
  }

  const resolve = <B, M extends AiModality>(
    modality: M,
    rawModelId: string,
    options: ResolveOptions = {},
  ): ResolvedBackend<B, M> => {
    const { module, context, capabilities, qualified } = buildContext(
      modality,
      rawModelId,
      options,
    )
    const factory = module[MODALITY_FACTORY_KEYS[modality]] as
      | ((ctx: BackendContext<any>) => B)
      | undefined
    if (!factory) throw AiProviderError.unsupportedModality(context.providerId, modality)

    return {
      providerId: context.providerId,
      modelId: context.modelId,
      qualifiedModelId: qualified,
      modality,
      backend: factory(context),
      capabilities,
      fingerprint: module.cacheFingerprint(context),
    }
  }

  const registry: MutableProviderRegistry = {
    get ids() {
      return [...modules.keys()]
    },

    has: (providerId) => modules.has(providerId),
    tryGet: (providerId) => modules.get(providerId),
    get,
    supports,

    modules: () => [...modules.values()],

    manifests: () => [...modules.values()].map((module) => module.manifest),

    descriptors: () =>
      [...modules.values()].map((module) => ({
        manifest: module.manifest,
        configuredOnServer: isProviderConfiguredOnServer(module),
        fieldStatus: providerFieldStatus(module),
        supportsCliLogin: typeof module.cliLogin?.start === "function",
      })),

    providersFor: (modality) =>
      [...modules.values()].filter((module) => supports(module.manifest.id, modality)),

    supportsModelDiscovery: (providerId) =>
      typeof modules.get(providerId)?.listModels === "function",

    async listModels(providerId, options = {}) {
      const module = get(providerId)
      if (typeof module.listModels !== "function") return []

      const credentials = resolveProviderCredentials(module, options.credentials)
      const context: ModelListContext<any> = {
        providerId,
        credentials,
        signal: options.signal,
        logLevel: options.logLevel,
      }

      const discovered = await module.listModels(context)

      const byId = new Map<string, DiscoveredModel>()
      for (const model of discovered) {
        if (options.modality && model.modalities && !model.modalities.includes(options.modality)) {
          continue
        }
        if (!byId.has(model.id)) byId.set(model.id, model)
      }
      return [...byId.values()]
    },

    declaredCapabilities: <M extends AiModality>(providerId: string, modality: M) =>
      modules.get(providerId)?.manifest.capabilities[modality] as
        | CapabilitiesFor<M>
        | undefined,

    capabilities: <M extends AiModality>(
      modality: M,
      rawModelId: string,
      options: ResolveOptions = {},
    ) => buildContext(modality, rawModelId, options).capabilities,

    defaultModelFor: (providerId, modality) =>
      modules.get(providerId)?.manifest.defaultModels[modality],

    resolveStructuredText: (rawModelId, options) =>
      resolve<StructuredTextBackend, "structured-text">(
        "structured-text",
        rawModelId,
        options,
      ),
    resolveAgent: (rawModelId, options) => {
      const resolved = resolve<AgentBackend, "agent">("agent", rawModelId, options)
      if (!resolved.capabilities.tools) {
        throw AiProviderError.unsupportedCapability(
          resolved.providerId,
          "agent",
          "tools",
          resolved.modelId,
        )
      }
      return resolved
    },
    resolveImage: (rawModelId, options) =>
      resolve<ImageBackend, "image">("image", rawModelId, options),
    resolveSpeechSynthesizer: (rawModelId, options) =>
      resolve<SpeechSynthesizer, "tts">("tts", rawModelId, options),
    resolveTranscriber: (rawModelId, options) =>
      resolve<Transcriber, "stt">("stt", rawModelId, options),

    register(module) {
      assertMutable()

      const validated = ProviderManifestSchema.safeParse(module.manifest)
      if (!validated.success) {
        throw new Error(
          `Invalid provider manifest for "${module.manifest?.id ?? "<unknown>"}": ` +
            validated.error.issues
              .map((issue) => `${issue.path.join(".") || "manifest"}: ${issue.message}`)
              .join("; "),
        )
      }

      const id = validated.data.id
      if (modules.has(id)) {
        throw new Error(`Duplicate provider id "${id}" in provider registry`)
      }

      for (const modality of validated.data.modalities) {
        if (typeof module[MODALITY_FACTORY_KEYS[modality]] !== "function") {
          throw new Error(
            `Provider "${id}" declares modality "${modality}" but does not implement ${MODALITY_FACTORY_KEYS[modality]}()`,
          )
        }
      }
      if (typeof module.cacheFingerprint !== "function") {
        throw new Error(`Provider "${id}" must implement cacheFingerprint()`)
      }

      assertNoHeaderConflict(modules, module)

      modules.set(id, { ...module, manifest: validated.data })
      return registry
    },

    freeze() {
      frozen = true
      return registry
    },
  }

  return registry
}

/** Ambiguous credential extraction must fail at bootstrap, not at request time. */
function assertNoHeaderConflict(
  modules: Map<string, AnyProviderModule>,
  incoming: AnyProviderModule,
): void {
  const claimed = new Map<string, string>()
  for (const [id, module] of modules) {
    for (const field of module.manifest.credentialFields) {
      for (const header of [field.header, ...field.legacyHeaders]) {
        claimed.set(header.toLowerCase(), id)
      }
    }
  }
  for (const field of incoming.manifest.credentialFields) {
    for (const header of [field.header, ...field.legacyHeaders]) {
      const owner = claimed.get(header.toLowerCase())
      if (owner) {
        throw new Error(
          `Provider "${incoming.manifest.id}" claims header "${header}" already used by "${owner}"`,
        )
      }
    }
  }
}
