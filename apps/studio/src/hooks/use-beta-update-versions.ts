import { useMutation, useQuery } from "@tanstack/react-query"
import type { AvailableRelease, UpdateStatus } from "./use-update-status"

const UPDATE_VERSIONS_QUERY_KEY = ["desktop-updates", "beta-versions"] as const

export function useBetaUpdateVersions(currentVersion?: string | null) {
  return useQuery({
    queryKey: [...UPDATE_VERSIONS_QUERY_KEY, currentVersion],
    queryFn: async (): Promise<AvailableRelease[]> => {
      const updates = window.api?.updates
      if (!updates) return []
      return updates.listVersions(true)
    },
    enabled: Boolean(currentVersion && window.api?.updates),
  })
}

export function useInstallBetaVersion() {
  return useMutation({
    mutationFn: async (version: string): Promise<UpdateStatus | undefined> => {
      const updates = window.api?.updates
      if (!updates) return undefined

      const selected = await updates.selectVersion(version)
      if (selected.phase === "error") throw new Error(selected.message)
      if (selected.phase !== "available") return selected

      const downloaded = await updates.download()
      if (downloaded.phase === "error") throw new Error(downloaded.message)
      return downloaded
    },
  })
}
