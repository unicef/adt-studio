import { useCallback, useMemo } from "react"
import type { ProviderDescriptor } from "@adt/types"
import { isProviderAvailable } from "@/api/provider-credentials"
import { useProviderCredentials } from "@/hooks/use-provider-credentials"

export type AuthKind = "api-key" | "cli" | "local"

export function authKind(descriptor: ProviderDescriptor): AuthKind {
  const fields = descriptor.manifest.credentialFields
  const allOptional = fields.every((f) => !f.required)
  const hasSecret = fields.some((f) => f.kind === "secret")
  if (allOptional && hasSecret) return "cli"
  if (allOptional && !hasSecret) return "local"
  return "api-key"
}

/** Per-provider view of {@link isProviderAvailable}: typed-in values or server-stored ones. */
export function requiredFieldsFilled(
  descriptor: ProviderDescriptor,
  creds: Record<string, string>,
): boolean {
  return isProviderAvailable(descriptor, { [descriptor.manifest.id]: creds })
}

export interface Providers {
  descriptors: ProviderDescriptor[]
  credentials: Record<string, Record<string, string>>
  credentialValue: (providerId: string, fieldKey: string) => string
  setCredential: (providerId: string, fieldKey: string, value: string) => void
  descriptorById: (providerId: string) => ProviderDescriptor | undefined
  isRegistered: (providerId: string) => boolean
  isLoading: boolean
  isError: boolean
}

/**
 * The providers screen's view of `/providers`: live manifests plus the local
 * credential store they declare. Manifests are the authority for which backends
 * exist and which fields each one needs.
 */
export function useProviders(): Providers {
  const { providers, credentials, credentialValue, setCredential, isLoading, error } =
    useProviderCredentials()

  const byId = useMemo(
    () => new Map(providers.map((provider) => [provider.manifest.id, provider])),
    [providers],
  )

  const descriptorById = useCallback(
    (providerId: string) => byId.get(providerId),
    [byId],
  )
  const isRegistered = useCallback((providerId: string) => byId.has(providerId), [byId])

  return {
    descriptors: providers as ProviderDescriptor[],
    credentials,
    credentialValue,
    setCredential,
    descriptorById,
    isRegistered,
    isLoading,
    isError: Boolean(error),
  }
}
