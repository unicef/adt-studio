import { Trans, useLingui } from "@lingui/react/macro"
import { ExternalLink, Loader2, LogIn, LogOut, TriangleAlert } from "lucide-react"
import type { ProviderDescriptor, ProviderHealthResponse } from "@adt/types"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useCliLogin } from "@/hooks/use-cli-login"
import { EASE } from "./shared"

/**
 * Sign a CLI-backed provider in or out without leaving Studio. The server runs
 * the CLI's own `login`, which opens the browser and stores the tokens itself;
 * Studio only shows the sign-in link in case the browser did not open. A key
 * configured in the server environment still outranks that login, so it is
 * called out here.
 */
export function CliLoginControls({
  descriptor,
  health,
}: {
  descriptor: ProviderDescriptor
  health: ProviderHealthResponse | null
}) {
  const { t } = useLingui()
  const providerId = descriptor.manifest.id
  const supported = descriptor.supportsCliLogin === true
  const login = useCliLogin(providerId, supported)
  if (!supported) return null

  const serverKeyConfigured = descriptor.fieldStatus.some((field) => field.configuredOnServer)
  const signedIn = health?.code === "local-login"
  const cliMissing = health?.code === "cli-not-found"
  const status = login.status
  const pending = status?.state === "pending"

  return (
    <div className="space-y-3">
      {serverKeyConfigured && (
        <div
          role="status"
          className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[12px] leading-normal"
        >
          <TriangleAlert className="mt-px size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
          <span>
            <Trans>
              An API key set in the server environment takes precedence over this sign-in. Remove it
              there to run on the signed-in account.
            </Trans>
          </span>
        </div>
      )}

      {pending ? (
        <div className="space-y-2.5 rounded-lg border bg-muted/30 p-3">
          <p className="flex items-center gap-1.5 text-[12.5px] leading-normal">
            <Loader2 className="size-3.5 shrink-0 animate-spin motion-reduce:animate-none" />
            <Trans>Finish signing in with ChatGPT in the browser window that just opened.</Trans>
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {status?.url && (
              <a
                href={status.url}
                target="_blank"
                rel="noreferrer"
                className={cn(
                  "inline-flex items-center gap-1.5 text-[12.5px] font-medium text-brand-700 underline-offset-4 hover:underline",
                  EASE,
                )}
              >
                <ExternalLink className="size-3.5" />
                <Trans>Browser didn&apos;t open? Use this link</Trans>
              </a>
            )}
            <Button type="button" variant="ghost" size="sm" className="ml-auto" onClick={login.cancel}>
              <Trans>Cancel</Trans>
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {!signedIn && !cliMissing && (
            <Button type="button" size="sm" onClick={login.start} disabled={login.isStarting}>
              {login.isStarting ? (
                <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" />
              ) : (
                <LogIn className="size-3.5" />
              )}
              {providerId === "codex" ? <Trans>Sign in with ChatGPT</Trans> : <Trans>Sign in</Trans>}
            </Button>
          )}
          {signedIn && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={login.logout}
              disabled={login.isLoggingOut}
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              aria-label={t`Sign out`}
            >
              <LogOut className="size-3.5" />
              <Trans>Sign out</Trans>
            </Button>
          )}
        </div>
      )}

      {status?.state === "failed" && (
        <p role="alert" className="text-[12.5px] text-destructive">
          <Trans>Sign-in failed: {status.detail}</Trans>
        </p>
      )}
    </div>
  )
}
