import { useEffect } from "react"
import { useLingui } from "@lingui/react/macro"
import { toast } from "sonner"
import { useCloudflareConnection } from "./use-cloudflare-connection"
import { useCloudflareCredentials } from "./use-cloudflare-credentials"

export interface SharingUpdate {
  /** The version installed in the account and the one this Studio ships, when they differ. */
  installed: string
  latest: string
}

/**
 * Whether the sharing service in the author's Cloudflare account is older than this Studio.
 *
 * One reading for every surface that mentions it — the sidebar dot, the one-time toast, the
 * Settings card, the Sharing page — so they can never disagree about whether there is an update.
 */
export function useSharingUpdate(): SharingUpdate | null {
  const { credentials } = useCloudflareCredentials()
  const connection = useCloudflareConnection(credentials)
  const data = connection.data
  if (!data?.connected || !data.upgrade_available || !data.worker_version) return null
  return { installed: data.worker_version, latest: data.latest_version }
}

const ANNOUNCED_KEY = "adt-sharing-update-announced"

/**
 * Says once, when the Studio opens, that a sharing update is waiting.
 *
 * The update used to be discoverable only by opening Settings → Sharing or a book's Sharing page,
 * so an author who shares a book a month could go on deploying new book hosts against an old
 * control plane indefinitely. Once per version: a toast every launch would be nagging, and a
 * later release deserves its own mention. No button — the sidebar dot is the way there.
 */
export function useSharingUpdateNotice(): void {
  const { t } = useLingui()
  const update = useSharingUpdate()

  useEffect(() => {
    if (!update) return
    try {
      if (window.localStorage.getItem(ANNOUNCED_KEY) === update.latest) return
      window.localStorage.setItem(ANNOUNCED_KEY, update.latest)
    } catch {
      return
    }
    toast.info(t`A sharing update is ready`, {
      description: t`Install it in Settings → Sharing to get the latest reader and code screen on your links.`,
    })
  }, [update, t])
}
