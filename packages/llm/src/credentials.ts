import type { CredentialFieldManifest, ProviderFieldStatus } from "@adt/types"
import { AiProviderError } from "./ports/errors.js"
import type { AnyProviderModule, ProviderCredentialValues } from "./ports/index.js"

/** Keyed by provider id, then field key. */
export type ResolvedCredentials = Record<string, Record<string, string>>

export type HeaderReader = (name: string) => string | undefined | null

export function extractCredentialsFromHeaders(
  modules: readonly AnyProviderModule[],
  getHeader: HeaderReader,
): ResolvedCredentials {
  const credentials: ResolvedCredentials = {}

  for (const module of modules) {
    const values: Record<string, string> = {}
    for (const field of module.manifest.credentialFields) {
      const candidates = [field.header, ...field.legacyHeaders]
      for (const name of candidates) {
        const raw = getHeader(name)
        const value = typeof raw === "string" ? raw.trim() : ""
        if (value) {
          values[field.key] = value
          break
        }
      }
    }
    if (Object.keys(values).length > 0) {
      credentials[module.manifest.id] = values
    }
  }

  return credentials
}

/**
 * One field's value, for the few paths that still construct a provider client by
 * hand. Prefer handing the whole set to the registry instead.
 */
export function credentialValue(
  credentials: ResolvedCredentials | undefined,
  providerId: string,
  fieldKey: string,
): string | undefined {
  const value = credentials?.[providerId]?.[fieldKey]?.trim()
  return value ? value : undefined
}

export function mergeWithServerCredentials(
  module: AnyProviderModule,
  provided: Record<string, string> | undefined,
): Record<string, string> {
  const fromServer = module.resolveServerCredentials?.() ?? {}
  const merged: Record<string, string> = {}

  for (const [key, value] of Object.entries(fromServer)) {
    if (typeof value === "string" && value.trim()) merged[key] = value.trim()
  }
  for (const [key, value] of Object.entries(provided ?? {})) {
    if (typeof value === "string" && value.trim()) merged[key] = value.trim()
  }

  return merged
}

/** Errors name the field's localized label — never the env var or the value. */
export function validateProviderCredentials<C extends ProviderCredentialValues>(
  module: AnyProviderModule,
  values: Record<string, string>,
): C {
  for (const field of module.manifest.credentialFields) {
    if (field.required && !values[field.key]) {
      throw AiProviderError.missingCredential(
        module.manifest.id,
        field.key,
        field.label.en,
      )
    }
  }

  const parsed = module.credentialSchema.safeParse(values)
  if (!parsed.success) {
    throw AiProviderError.invalidCredential(
      module.manifest.id,
      parsed.error.issues,
    )
  }
  return parsed.data as C
}

/** Finds the provider a `sharedWith` field points at; `undefined` when unknown. */
export type ProviderLookup = (providerId: string) => AnyProviderModule | undefined

function trimmed(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}

/** The shared provider's server-side value for a `sharedWith` field, if any. */
function sharedServerValue(
  field: CredentialFieldManifest,
  lookup: ProviderLookup | undefined,
): string | undefined {
  const share = field.sharedWith
  if (!share) return undefined
  return trimmed(lookup?.(share.providerId)?.resolveServerCredentials?.()?.[share.fieldKey])
}

/**
 * A provider's credential values with every source applied and nothing
 * validated: own request header, own server env, then — for a field that
 * declares `sharedWith` — the shared provider's request header and its server
 * env. A provider's own key therefore beats a shared one wherever each lives,
 * and within one kind the request beats the server. Studio sends only the
 * keys it stores, so this is the one place a borrowed key is introduced.
 */
export function resolveCredentialValues(
  module: AnyProviderModule,
  credentials: ResolvedCredentials | undefined,
  lookup?: ProviderLookup,
): Record<string, string> {
  const values = mergeWithServerCredentials(module, credentials?.[module.manifest.id])
  for (const field of module.manifest.credentialFields) {
    const share = field.sharedWith
    if (!share || values[field.key]) continue
    const shared =
      trimmed(credentials?.[share.providerId]?.[share.fieldKey]) ??
      sharedServerValue(field, lookup)
    if (shared) values[field.key] = shared
  }
  return values
}

export function resolveProviderCredentials<C extends ProviderCredentialValues>(
  module: AnyProviderModule,
  credentials: ResolvedCredentials | undefined,
  lookup?: ProviderLookup,
): C {
  return validateProviderCredentials<C>(
    module,
    resolveCredentialValues(module, credentials, lookup),
  )
}

/** Presence only; never a value. A shared field counts the shared provider's env too. */
export function providerFieldStatus(
  module: AnyProviderModule,
  lookup?: ProviderLookup,
): ProviderFieldStatus[] {
  const fromServer = module.resolveServerCredentials?.() ?? {}
  return module.manifest.credentialFields.map((field) => ({
    key: field.key,
    configuredOnServer: Boolean(
      trimmed(fromServer[field.key]) ?? sharedServerValue(field, lookup),
    ),
  }))
}

export function isProviderConfiguredOnServer(
  module: AnyProviderModule,
  lookup?: ProviderLookup,
): boolean {
  const status = new Map(
    providerFieldStatus(module, lookup).map((entry) => [entry.key, entry.configuredOnServer]),
  )
  const required = module.manifest.credentialFields.filter((field) => field.required)
  if (required.length === 0) return true
  return required.every((field) => status.get(field.key) === true)
}

/** Presence only; safe to log. */
export function describeCredentialPresence(
  modules: readonly AnyProviderModule[],
  credentials: ResolvedCredentials | undefined,
): Record<string, string[]> {
  const summary: Record<string, string[]> = {}
  for (const module of modules) {
    const values = credentials?.[module.manifest.id]
    if (!values) continue
    const present = module.manifest.credentialFields
      .filter((field) => Boolean(values[field.key]))
      .map((field) => field.key)
    if (present.length > 0) summary[module.manifest.id] = present
  }
  return summary
}
