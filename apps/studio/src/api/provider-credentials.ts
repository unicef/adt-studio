import type { AiModality, ProviderDescriptor } from "@adt/types"

/** Credential values keyed by provider id, then manifest field key. */
export type ProviderCredentialValues = Record<string, Record<string, string>>

export interface CredentialStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

/** Browser storage adapter that preserves the previous best-effort behavior. */
export const browserCredentialStorage: CredentialStorage = {
  getItem(key) {
    try {
      return window.localStorage.getItem(key)
    } catch {
      return null
    }
  },
  setItem(key, value) {
    try {
      window.localStorage.setItem(key, value)
    } catch {
      // localStorage may be unavailable in privacy-restricted contexts.
    }
  },
  removeItem(key) {
    try {
      window.localStorage.removeItem(key)
    } catch {
      // localStorage may be unavailable in privacy-restricted contexts.
    }
  },
}

/** Build request headers exclusively from the public provider manifests. */
export function buildProviderCredentialHeaders(
  providers: readonly ProviderDescriptor[],
  credentials: ProviderCredentialValues,
): Record<string, string> {
  const headers: Record<string, string> = {}

  for (const { manifest } of providers) {
    const values = credentials[manifest.id]
    if (!values) continue

    for (const field of manifest.credentialFields) {
      const value = values[field.key]?.trim()
      if (value) headers[field.header] = value
    }
  }

  return headers
}

export function isProviderAvailable(
  provider: ProviderDescriptor,
  credentials: ProviderCredentialValues,
): boolean {
  const serverFields = new Map(
    provider.fieldStatus.map((field) => [field.key, field.configuredOnServer]),
  )
  return provider.manifest.credentialFields
    .filter((field) => field.required)
    .every(
      (field) =>
        Boolean(credentials[provider.manifest.id]?.[field.key]?.trim()) ||
        serverFields.get(field.key) === true,
    )
}

export type ModelModalitySupport =
  | { ok: true; providerId: string }
  | { ok: false; providerId: string; reason: "unknown-provider" | "unsupported-modality" }

/**
 * Pre-save hint about whether a model's provider is registered and supports a
 * modality, derived from the public `/providers` manifests. Advisory only — the
 * API remains the authority and validates again on save.
 */
export function checkModelModalitySupport(
  providers: readonly ProviderDescriptor[],
  modelId: string,
  modality: AiModality,
): ModelModalitySupport {
  const trimmed = modelId.trim()
  const separator = trimmed.indexOf(":")
  const providerId = (
    separator === -1 ? "openai" : trimmed.slice(0, separator)
  ).toLowerCase()
  const provider = providers.find(({ manifest }) => manifest.id === providerId)
  if (!provider) return { ok: false, providerId, reason: "unknown-provider" }
  if (!provider.manifest.modalities.includes(modality)) {
    return { ok: false, providerId, reason: "unsupported-modality" }
  }
  return { ok: true, providerId }
}

/** Resolve availability for the effective provider/model exposed by `/providers`. */
export function isAiOperationAvailable(
  providers: readonly ProviderDescriptor[],
  credentials: ProviderCredentialValues,
  defaults: Partial<Record<AiModality, string>>,
  modality: AiModality,
  modelId?: string,
): boolean {
  const effectiveModel = modelId?.trim() || defaults[modality]?.trim()
  if (!effectiveModel) return false
  const separator = effectiveModel.indexOf(":")
  const providerId = (
    separator === -1 ? "openai" : effectiveModel.slice(0, separator)
  ).toLowerCase()
  const provider = providers.find(({ manifest }) => manifest.id === providerId)
  return Boolean(
    provider &&
      provider.manifest.modalities.includes(modality) &&
      isProviderAvailable(provider, credentials),
  )
}

/** Read current and legacy storage keys declared by each provider. */
export function readProviderCredentialsFromStorage(
  providers: readonly ProviderDescriptor[],
  storage: CredentialStorage,
): ProviderCredentialValues {
  const credentials: ProviderCredentialValues = {}

  for (const { manifest } of providers) {
    const values: Record<string, string> = {}
    for (const field of manifest.credentialFields) {
      for (const storageKey of [field.storageKey, ...field.legacyStorageKeys]) {
        const value = storage.getItem(storageKey)?.trim()
        if (value) {
          values[field.key] = value
          break
        }
      }
    }
    if (Object.keys(values).length > 0) credentials[manifest.id] = values
  }

  return credentials
}

/** Write the canonical key and clear legacy copies so stale values cannot return. */
export function writeProviderCredentialToStorage(
  provider: ProviderDescriptor,
  fieldKey: string,
  value: string,
  storage: CredentialStorage,
): void {
  const field = provider.manifest.credentialFields.find((item) => item.key === fieldKey)
  if (!field) {
    throw new Error(`Unknown credential field "${fieldKey}" for provider "${provider.manifest.id}"`)
  }

  const normalized = value.trim()
  if (normalized) storage.setItem(field.storageKey, normalized)
  else storage.removeItem(field.storageKey)
  for (const legacyKey of field.legacyStorageKeys) storage.removeItem(legacyKey)
}
