import { Trans } from "@lingui/react/macro"
import { ArrowUpCircle, CloudOff } from "lucide-react"
import { PublishingSettingsLink } from "@/components/pipeline/stages/export/publish/PublishingSettingsLink"
import { useCloudflareConnection } from "@/hooks/use-cloudflare-connection"
import { useCloudflareCredentials } from "@/hooks/use-cloudflare-credentials"

/**
 * When the publishing service in the author's own Cloudflare account is behind the Studio.
 *
 * It earns a place on this page because the mismatch is invisible everywhere else and its
 * symptoms are not: a feature the Studio offers can simply be missing, and the way that surfaces
 * is a panel saying something that sounds like data loss. That happened — the readers list
 * reported "this publication is not in this account" for a perfectly healthy book, because the
 * deployed worker had never heard of the route. The version is the cause; this says so.
 *
 * Deliberately not alarming. The link keeps working, readers keep reading, and nothing is lost by
 * waiting — so it states the fact, offers the door, and does not colour itself like an error.
 */
export function PublishingEngineNotice() {
  const { credentials } = useCloudflareCredentials()
  const connection = useCloudflareConnection(credentials)
  const data = connection.data

  if (!data?.connected) return null

  /** Unreachable is a different, louder problem, and the dashboard's own status chip says it —
   *  but a version comparison against a service that is not answering means nothing, so this
   *  stays quiet rather than guessing. */
  if (!data.worker_reachable) {
    return (
      <p
        data-testid="publish-engine-unreachable"
        className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-2.5 text-xs leading-5 text-amber-900"
      >
        <CloudOff className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        <Trans>
          Your publishing service isn't answering, so what this page says about versions and
          readers may be out of date. The link itself is usually fine.
        </Trans>
      </p>
    )
  }

  if (!data.upgrade_available) return null

  return (
    <div
      data-testid="publish-engine-outdated"
      className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-indigo-200 bg-indigo-50/60 px-3.5 py-2.5"
    >
      <ArrowUpCircle className="size-4 shrink-0 text-indigo-600" aria-hidden="true" />
      <p className="min-w-0 flex-1 text-xs leading-5 text-indigo-900">
        <Trans>
          Your publishing service is version {data.worker_version ?? "?"}; the Studio ships{" "}
          {data.latest_version}. Newer features can be missing until you install it — your link and
          your readers are unaffected either way.
        </Trans>
      </p>
      <PublishingSettingsLink variant="outline" size="sm" className="h-7 shrink-0 text-xs">
        <Trans>Install the update</Trans>
      </PublishingSettingsLink>
    </div>
  )
}
