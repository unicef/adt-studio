import type { ProviderFieldStatus } from "@adt/types"
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
      parsed.error.issues
        .map((issue) => `${issue.path.join(".") || "credentials"}: ${issue.message}`)
        .join("; "),
    )
  }
  return parsed.data as C
}

export function resolveProviderCredentials<C extends ProviderCredentialValues>(
  module: AnyProviderModule,
  credentials: ResolvedCredentials | undefined,
): C {
  return validateProviderCredentials<C>(
    module,
    mergeWithServerCredentials(module, credentials?.[module.manifest.id]),
  )
}

/** Presence only; never a value. */
export function providerFieldStatus(
  module: AnyProviderModule,
): ProviderFieldStatus[] {
  const fromServer = module.resolveServerCredentials?.() ?? {}
  return module.manifest.credentialFields.map((field) => ({
    key: field.key,
    configuredOnServer: Boolean(fromServer[field.key]?.trim()),
  }))
}

export function isProviderConfiguredOnServer(module: AnyProviderModule): boolean {
  const status = new Map(
    providerFieldStatus(module).map((entry) => [entry.key, entry.configuredOnServer]),
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
