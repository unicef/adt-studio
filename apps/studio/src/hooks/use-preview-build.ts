import { useCallback, useSyncExternalStore } from "react"
import { useQuery } from "@tanstack/react-query"
import { previewPullRequestNumber } from "@/components/updates/release-banner-utils"
import { useAppVersion } from "./use-app-version"

export type PreviewBuildStatus = ElectronPreviewBuildStatus

const STORAGE_KEY = "adt.preview-build-seen"

function readSeen(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

let seen = typeof window === "undefined" ? null : readSeen()
const listeners = new Set<() => void>()

function markSeen(key: string) {
  seen = key
  try {
    localStorage.setItem(STORAGE_KEY, key)
  } catch {
    /* ignore */
  }
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function previewBuildNoticeKey(status: PreviewBuildStatus | null): string | null {
  if (!status || status.state === "open") return null
  return [status.version, status.state, status.shippedIn ?? ""].join(":")
}

export function isPreviewBuildSettled(status: PreviewBuildStatus | null | undefined): boolean {
  return status?.state === "closed" || (status?.state === "merged" && Boolean(status.shippedIn))
}

export function usePreviewBuild() {
  const version = useAppVersion()
  const query = useQuery({
    queryKey: ["desktop-updates", "preview-build", version],
    queryFn: async () => (await window.api?.updates?.previewBuild()) ?? null,
    enabled: version != null && previewPullRequestNumber(version) != null,
    staleTime: 5 * 60 * 1000,
    refetchInterval: (query) => (isPreviewBuildSettled(query.state.data) ? false : 30 * 60 * 1000),
    retry: 1,
    refetchOnWindowFocus: false,
  })
  const seenKey = useSyncExternalStore(subscribe, () => seen)
  const status = query.data ?? null
  const noticeKey = previewBuildNoticeKey(status)

  const acknowledge = useCallback(() => {
    if (noticeKey && seen !== noticeKey) markSeen(noticeKey)
  }, [noticeKey])

  return { status, needsAttention: noticeKey != null && seenKey !== noticeKey, acknowledge }
}
