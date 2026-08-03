import type { AiModality, AiProviderErrorCode } from "@adt/types"

export interface AiProviderErrorDetails {
  providerId?: string
  modelId?: string
  modality?: AiModality
  capability?: string
  credentialKey?: string
}

export class AiProviderError extends Error {
  readonly code: AiProviderErrorCode
  readonly details: AiProviderErrorDetails

  constructor(
    code: AiProviderErrorCode,
    message: string,
    details: AiProviderErrorDetails = {},
  ) {
    super(message)
    this.name = "AiProviderError"
    this.code = code
    this.details = details
  }

  static is(error: unknown): error is AiProviderError {
    return error instanceof AiProviderError
  }

  static unknownProvider(providerId: string, known: readonly string[]): AiProviderError {
    return new AiProviderError(
      "unknown-provider",
      `Unknown AI provider "${providerId}". Registered providers: ${known.join(", ") || "none"}.`,
      { providerId },
    )
  }

  static unsupportedModality(providerId: string, modality: AiModality): AiProviderError {
    return new AiProviderError(
      "unsupported-modality",
      `Provider "${providerId}" does not support the "${modality}" modality.`,
      { providerId, modality },
    )
  }

  static unsupportedCapability(
    providerId: string,
    modality: AiModality,
    capability: string,
    modelId?: string,
  ): AiProviderError {
    const model = modelId ? ` (model "${modelId}")` : ""
    return new AiProviderError(
      "unsupported-capability",
      `Provider "${providerId}"${model} does not support "${capability}" for the "${modality}" modality.`,
      { providerId, modality, capability, modelId },
    )
  }

  static missingCredential(
    providerId: string,
    credentialKey: string,
    label: string,
  ): AiProviderError {
    return new AiProviderError(
      "missing-credential",
      `Provider "${providerId}" requires ${label}. Configure it in Settings or on the server.`,
      { providerId, credentialKey },
    )
  }

  static invalidCredential(providerId: string, reason: string): AiProviderError {
    return new AiProviderError(
      "invalid-credential",
      `Invalid credentials for provider "${providerId}": ${reason}`,
      { providerId },
    )
  }

  static invalidModelId(raw: string, reason: string): AiProviderError {
    return new AiProviderError("invalid-model-id", `Invalid model id "${raw}": ${reason}`)
  }
}
