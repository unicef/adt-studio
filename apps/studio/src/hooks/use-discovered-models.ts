import { useMemo } from "react"
import { useQueries } from "@tanstack/react-query"
import type { AiModality } from "@adt/types"
import { getProviderModels } from "@/api/client"
import { isProviderAvailable } from "@/api/provider-credentials"
import { useProviderCredentials } from "./use-provider-credentials"

const DISCOVERY_STALE_TIME_MS = 5 * 60 * 1000

/**
 * Qualified `provider:model` ids surfaced by live discovery, for the given
 * modality. Advisory only: the list feeds model-picker suggestions and is never
 * authoritative — a selected id still passes normal validation on save. Only
 * available, modality-matching providers are queried; failures resolve to an
 * empty contribution so the picker falls back to its static groups.
 */
export function useDiscoveredModelIds(modality: AiModality): string[] {
  const { providers, credentials } = useProviderCredentials()

  const candidates = useMemo(
    () =>
      providers.filter(
        (provider) =>
          provider.manifest.modalities.includes(modality) &&
          isProviderAvailable(provider, credentials),
      ),
    [providers, credentials, modality],
  )

  const results = useQueries({
    queries: candidates.map((provider) => ({
      queryKey: ["provider-models", provider.manifest.id, modality],
      queryFn: () => getProviderModels(provider.manifest.id, modality),
      staleTime: DISCOVERY_STALE_TIME_MS,
      retry: false,
    })),
  })

  return useMemo(() => {
    const ids = new Set<string>()
    results.forEach((result, index) => {
      const provider = candidates[index]
      if (!provider || !result.data?.supported) return
      for (const model of result.data.models) {
        ids.add(`${provider.manifest.id}:${model.id}`)
      }
    })
    return [...ids]
  }, [results, candidates])
}
