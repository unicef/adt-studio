import { AlertCircle, CheckCircle2, HelpCircle, Loader2, RefreshCw } from "lucide-react"
import type { ProviderHealthCode, ProviderHealthResponse } from "@adt/types"
import { Trans, useLingui } from "@lingui/react/macro"
import { Button } from "@/components/ui/button"
import { useProviderHealth } from "@/hooks/use-provider-health"

interface ProviderConnectionStatusProps {
  providerId: string
  draftCredentials: Record<string, string> | undefined
}

export function ProviderConnectionStatus({
  providerId,
  draftCredentials,
}: ProviderConnectionStatusProps) {
  const { t } = useLingui()
  const { data, error, isFetching, refetch } = useProviderHealth(
    providerId,
    draftCredentials,
    true,
  )

  /** The API returns stable codes, never prose, so every message is translated here. */
  const describe = (health: ProviderHealthResponse): string => {
    switch (health.code) {
      case "ok":
        return health.modelCount === undefined
          ? t`Connected successfully.`
          : t`Connected successfully — ${health.modelCount} models available.`
      case "local-login":
        return t`Connected through the login already present on this machine.`
      case "configured":
        return t`Credentials are set, but this provider offers no automatic check.`
      case "missing-credential":
        return t`A required credential is missing.`
      case "invalid-credential":
        return t`The provider rejected these credentials.`
      case "cli-not-found":
        return t`The command-line tool this provider needs was not found on this machine.`
      case "not-logged-in":
        return t`No login found on this machine. Sign in with the provider's CLI or set an API key.`
      case "unreachable":
        return t`The provider could not be reached.`
      case "invalid-response":
        return t`The provider answered with an unexpected response.`
      case "unsupported":
        return t`This provider has no automatic connection check.`
    }
  }

  const message = isFetching
    ? t`Checking the connection…`
    : error
      ? t`The connection check could not be completed.`
      : data
        ? describe(data)
        : t`Connection not checked yet.`

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2">
      <StatusIcon isFetching={isFetching} failed={Boolean(error)} code={data?.code} />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-sm">{message}</span>
        {!isFetching && data?.detail && (
          <span className="truncate text-xs text-muted-foreground">{data.detail}</span>
        )}
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => void refetch()}
        disabled={isFetching}
      >
        <RefreshCw data-icon="inline-start" />
        <Trans>Test connection</Trans>
      </Button>
    </div>
  )
}

function StatusIcon({
  isFetching,
  failed,
  code,
}: {
  isFetching: boolean
  failed: boolean
  code: ProviderHealthCode | undefined
}) {
  if (isFetching) {
    return <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" aria-hidden />
  }
  if (failed) return <AlertCircle className="h-4 w-4 shrink-0 text-destructive" aria-hidden />
  if (!code) return <HelpCircle className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
  if (code === "ok" || code === "local-login") {
    return <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
  }
  if (code === "configured" || code === "unsupported") {
    return <HelpCircle className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
  }
  return <AlertCircle className="h-4 w-4 shrink-0 text-destructive" aria-hidden />
}
