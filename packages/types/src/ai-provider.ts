import { z } from "zod"
import { AiModality, ProviderId, StructuredOutputStrategy } from "./model-id.js"

export const SUPPORTED_PROVIDER_LOCALES = ["en", "pt-BR", "es", "fr", "sq"] as const
export const SupportedProviderLocale = z.enum(SUPPORTED_PROVIDER_LOCALES)
export type SupportedProviderLocale = z.infer<typeof SupportedProviderLocale>

export const LocalizedText = z.object({
  en: z.string().min(1),
  "pt-BR": z.string().min(1),
  es: z.string().min(1),
  fr: z.string().min(1),
  sq: z.string().min(1),
})
export type LocalizedText = z.infer<typeof LocalizedText>

export const CREDENTIAL_FIELD_KINDS = ["secret", "url", "text", "select"] as const
export const CredentialFieldKind = z.enum(CREDENTIAL_FIELD_KINDS)
export type CredentialFieldKind = z.infer<typeof CredentialFieldKind>

/**
 * Claiming one of these would let a provider module rewrite transport-level or
 * auth headers on every Studio request.
 */
export const FORBIDDEN_CREDENTIAL_HEADERS = [
  "authorization",
  "proxy-authorization",
  "cookie",
  "set-cookie",
  "host",
  "connection",
  "content-length",
  "content-type",
  "transfer-encoding",
  "upgrade",
  "te",
  "trailer",
  "expect",
  "origin",
  "referer",
  "forwarded",
  "x-forwarded-for",
  "x-forwarded-host",
  "x-forwarded-proto",
  "x-real-ip",
] as const

const HEADER_NAME_PATTERN = /^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/

/** Required prefix for headers introduced after the legacy set was frozen. */
export const PROVIDER_HEADER_NAMESPACE = "X-ADT-Provider-"

const CredentialHeaderName = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(HEADER_NAME_PATTERN, "invalid header name")
  .refine(
    (value) =>
      !(FORBIDDEN_CREDENTIAL_HEADERS as readonly string[]).includes(
        value.toLowerCase(),
      ),
    { message: "header name is reserved and cannot carry a credential" },
  )

export const CredentialFieldOption = z.object({
  value: z.string().min(1),
  label: LocalizedText,
})
export type CredentialFieldOption = z.infer<typeof CredentialFieldOption>

export const CredentialFieldManifest = z
  .object({
    key: z.string().regex(/^[a-z][a-zA-Z0-9]{0,63}$/, "invalid credential field key"),
    kind: CredentialFieldKind,
    label: LocalizedText,
    required: z.boolean(),
    header: CredentialHeaderName,
    legacyHeaders: z.array(CredentialHeaderName).default([]),
    storageKey: z.string().min(1).max(120),
    legacyStorageKeys: z.array(z.string().min(1).max(120)).default([]),
    placeholder: z.string().max(200).optional(),
    help: LocalizedText.optional(),
    options: z.array(CredentialFieldOption).optional(),
    maxLength: z.number().int().positive().max(8192).optional(),
    /** Client-side hint only; the provider's Zod schema is the authority. */
    pattern: z.string().max(200).optional(),
  })
  .superRefine((field, ctx) => {
    if (field.kind === "select" && (!field.options || field.options.length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "select credential fields must declare options",
      })
    }
  })
export type CredentialFieldManifest = z.infer<typeof CredentialFieldManifest>

export const StructuredTextCapabilities = z.object({
  /** Most preferred first. */
  strategies: z.array(StructuredOutputStrategy).min(1),
  recursiveSchemas: z.boolean(),
  imageInput: z.boolean(),
  temperature: z.boolean(),
  maxOutputTokens: z.number().int().positive().optional(),
})
export type StructuredTextCapabilities = z.infer<typeof StructuredTextCapabilities>

export const AgentCapabilities = z.object({
  tools: z.boolean(),
  streaming: z.boolean(),
  maxSteps: z.number().int().positive().optional(),
})
export type AgentCapabilities = z.infer<typeof AgentCapabilities>

export const ImageCapabilities = z.object({
  generate: z.boolean(),
  edit: z.boolean(),
  /** `WxH` sizes; empty accepts any size. */
  sizes: z.array(z.string().regex(/^\d+x\d+$/)).default([]),
  mimeTypes: z.array(z.string().min(1)).default([]),
  maxReferenceImages: z.number().int().min(0).optional(),
})
export type ImageCapabilities = z.infer<typeof ImageCapabilities>

export const TtsCapabilities = z.object({
  /** Lowercase container/codec names. */
  formats: z.array(z.string().min(1)).min(1),
  voices: z.array(z.string().min(1)).default([]),
  /** BCP-47 tags; empty when the provider is language-agnostic. */
  languages: z.array(z.string().min(1)).default([]),
  instructions: z.boolean(),
  maxInputLength: z.number().int().positive().optional(),
  defaultRequestsPerMinute: z.number().int().positive().optional(),
  rateLimitMode: z.enum(["fixed", "adaptive"]).default("fixed"),
})
export type TtsCapabilities = z.infer<typeof TtsCapabilities>

export const SttCapabilities = z.object({
  wordTimestamps: z.boolean(),
  /** Lowercase file extensions without the leading dot. */
  inputFormats: z.array(z.string().min(1)).min(1),
  languageHint: z.boolean(),
})
export type SttCapabilities = z.infer<typeof SttCapabilities>

export const PublicProviderCapabilities = z.object({
  "structured-text": StructuredTextCapabilities.optional(),
  agent: AgentCapabilities.optional(),
  image: ImageCapabilities.optional(),
  tts: TtsCapabilities.optional(),
  stt: SttCapabilities.optional(),
})
export type PublicProviderCapabilities = z.infer<typeof PublicProviderCapabilities>

export const ProviderDefaultModels = z.record(AiModality, z.string().min(1))
export type ProviderDefaultModels = z.infer<typeof ProviderDefaultModels>

export const ProviderManifest = z
  .object({
    id: ProviderId,
    displayName: z.string().min(1).max(80),
    modalities: z.array(AiModality).min(1),
    credentialFields: z.array(CredentialFieldManifest).default([]),
    capabilities: PublicProviderCapabilities,
    defaultModels: ProviderDefaultModels.default({}),
    localizedHelp: LocalizedText.optional(),
    docsUrl: z.string().url().optional(),
  })
  .superRefine((manifest, ctx) => {
    for (const modality of manifest.modalities) {
      if (!manifest.capabilities[modality]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `modality "${modality}" is declared but has no capabilities`,
        })
      }
    }
    for (const modality of Object.keys(manifest.capabilities)) {
      if (!manifest.modalities.includes(modality as never)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `capabilities declare "${modality}" which is not in modalities`,
        })
      }
    }
    const keys = new Set<string>()
    for (const field of manifest.credentialFields) {
      if (keys.has(field.key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `duplicate credential field key "${field.key}"`,
        })
      }
      keys.add(field.key)
    }
  })
export type ProviderManifest = z.infer<typeof ProviderManifest>

export const ProviderFieldStatus = z.object({
  key: z.string(),
  configuredOnServer: z.boolean(),
})
export type ProviderFieldStatus = z.infer<typeof ProviderFieldStatus>

export const ProviderDescriptor = z.object({
  manifest: ProviderManifest,
  configuredOnServer: z.boolean(),
  fieldStatus: z.array(ProviderFieldStatus),
})
export type ProviderDescriptor = z.infer<typeof ProviderDescriptor>

export const ProvidersResponse = z.object({
  providers: z.array(ProviderDescriptor),
  defaults: z.record(AiModality, z.string()).default({}),
})
export type ProvidersResponse = z.infer<typeof ProvidersResponse>

export const AI_PROVIDER_ERROR_CODES = [
  "unknown-provider",
  "unsupported-modality",
  "unsupported-capability",
  "missing-credential",
  "invalid-credential",
  "invalid-model-id",
] as const
export const AiProviderErrorCode = z.enum(AI_PROVIDER_ERROR_CODES)
export type AiProviderErrorCode = z.infer<typeof AiProviderErrorCode>

/**
 * A model surfaced by a provider's live catalogue. Advisory only: discovery
 * populates UI suggestions and never becomes the authority for validation —
 * `safeParseModelId` and registry capability resolution stay in charge.
 */
export const DiscoveredModel = z.object({
  /** Provider-scoped model id, case preserved (no `provider:` prefix). */
  id: z.string().min(1),
  displayName: z.string().min(1).optional(),
  /** Best-effort; present only when the provider reports usable modalities. */
  modalities: z.array(AiModality).optional(),
})
export type DiscoveredModel = z.infer<typeof DiscoveredModel>

/** Non-secret reason a discovery attempt produced no usable list. */
export const MODEL_DISCOVERY_ERROR_CODES = [
  "unsupported",
  "missing-credential",
  "unreachable",
  "invalid-response",
] as const
export const ModelDiscoveryErrorCode = z.enum(MODEL_DISCOVERY_ERROR_CODES)
export type ModelDiscoveryErrorCode = z.infer<typeof ModelDiscoveryErrorCode>

export const ModelDiscoveryResponse = z.object({
  providerId: ProviderId,
  /** False when the provider declares no discovery or the attempt failed. */
  supported: z.boolean(),
  models: z.array(DiscoveredModel).default([]),
  error: ModelDiscoveryErrorCode.optional(),
})
export type ModelDiscoveryResponse = z.infer<typeof ModelDiscoveryResponse>
