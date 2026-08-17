import { useCallback, useEffect, useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import type { ProvidersResponse } from "@adt/types"
import { getProviders } from "@/api/client"
import {
  browserCredentialStorage,
  isAiOperationAvailable,
  readProviderCredentialsFromStorage,
  writeProviderCredentialToStorage,
} from "@/api/provider-credentials"

const CREDENTIALS_CHANGED_EVENT = "adt-provider-credentials-changed"

// Stable fallbacks: a fresh `?? []` per render would give `credentials` a new
// identity on every render while /providers is pending or errored, and any
// effect keyed on it (ApiKeyDialog's draft sync) would loop.
const EMPTY_PROVIDERS: ProvidersResponse["providers"] = []
const EMPTY_DEFAULTS: ProvidersResponse["defaults"] = {}

export function useProviderCredentials() {
  const providersQuery = useQuery({
    queryKey: ["providers"],
    queryFn: getProviders,
    staleTime: Infinity,
  })
  const [storageRevision, setStorageRevision] = useState(0)

  useEffect(() => {
    const refresh = () => setStorageRevision((revision) => revision + 1)
    window.addEventListener(CREDENTIALS_CHANGED_EVENT, refresh)
    window.addEventListener("storage", refresh)
    return () => {
      window.removeEventListener(CREDENTIALS_CHANGED_EVENT, refresh)
      window.removeEventListener("storage", refresh)
    }
  }, [])

  const providers = providersQuery.data?.providers ?? EMPTY_PROVIDERS
  const defaults = providersQuery.data?.defaults ?? EMPTY_DEFAULTS
  const credentials = useMemo(
    () => readProviderCredentialsFromStorage(providers, browserCredentialStorage),
    [providers, storageRevision],
  )

  const setCredential = useCallback(
    (providerId: string, fieldKey: string, value: string) => {
      const provider = providers.find(({ manifest }) => manifest.id === providerId)
      if (!provider) {
        throw new Error(`Unknown provider "${providerId}"`)
      }
      writeProviderCredentialToStorage(provider, fieldKey, value, browserCredentialStorage)
      window.dispatchEvent(new Event(CREDENTIALS_CHANGED_EVENT))
    },
    [providers],
  )

  const credentialValue = useCallback(
    (providerId: string, fieldKey: string) => credentials[providerId]?.[fieldKey] ?? "",
    [credentials],
  )

  const isAvailable = useCallback(
    (modality: Parameters<typeof isAiOperationAvailable>[3], modelId?: string) =>
      isAiOperationAvailable(
        providers,
        credentials,
        defaults,
        modality,
        modelId,
      ),
    [providers, credentials, defaults],
  )

  return {
    providers,
    defaults,
    credentials,
    credentialValue,
    isAvailable,
    setCredential,
    isLoading: providersQuery.isLoading,
    error: providersQuery.error,
  }
}
