
export const AI_MODALITIES = ["structured-text", "agent", "image", "tts", "stt"] as const
export type AiModality = (typeof AI_MODALITIES)[number]

export const CREDENTIAL_FIELD_KINDS = ["secret", "url", "text", "select"] as const
export type CredentialFieldKind = (typeof CREDENTIAL_FIELD_KINDS)[number]

export type LocalizedText = { en: string } & Partial<Record<string, string>>

export interface CredentialFieldOption {
  value: string
  label: LocalizedText
}

export interface CredentialFieldManifest {
  key: string
  kind: CredentialFieldKind
  label: LocalizedText
  required: boolean
  header: string
  storageKey: string
  placeholder?: string
  help?: LocalizedText
  options?: CredentialFieldOption[]
  maxLength?: number
  pattern?: string
}

export interface ProviderManifest {
  id: string
  displayName: string
  modalities: AiModality[]
  credentialFields: CredentialFieldManifest[]
  defaultModels: Partial<Record<AiModality, string>>
  localizedHelp?: LocalizedText
  docsUrl?: string
}

export interface ProviderFieldStatus {
  key: string
  configuredOnServer: boolean
}

export interface ProviderDescriptor {
  manifest: ProviderManifest
  configuredOnServer: boolean
  fieldStatus: ProviderFieldStatus[]
}

export const PROVIDER_HEALTH_CODES = [
  "ok",
  "local-login",
  "configured",
  "missing-credential",
  "invalid-credential",
  "cli-not-found",
  "not-logged-in",
  "unreachable",
  "invalid-response",
  "unsupported",
] as const
export type ProviderHealthCode = (typeof PROVIDER_HEALTH_CODES)[number]

export interface ProviderHealthResponse {
  providerId: string
  ok: boolean
  code: ProviderHealthCode
  modelCount?: number
  detail?: string
}

export type ProviderCredentialValues = Record<string, Record<string, string>>
