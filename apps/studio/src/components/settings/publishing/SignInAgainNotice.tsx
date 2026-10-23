import { useEffect, useRef } from "react"
import { Trans } from "@lingui/react/macro"
import { AlertTriangle, Loader2, LogIn } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useCloudflareOAuth } from "@/hooks/use-cloudflare-oauth"
import { openExternalUrl } from "./open-external"

interface SignInAgainNoticeProps {
  accountName: string | null
}

/**
 * Shown on a connection with no credential behind it: the saved Cloudflare login was refused
 * or signed out, so sharing and updates are blocked until the author signs in again. The new
 * login is bound to the connection's own account by the API, so there is nothing to choose.
 */
export function SignInAgainNotice({ accountName }: SignInAgainNoticeProps) {
  const oauth = useCloudflareOAuth()
  const openedAuthUrlRef = useRef<string | null>(null)

  useEffect(() => {
    if (oauth.phase !== "waiting" || !oauth.authUrl) return
    if (openedAuthUrlRef.current === oauth.authUrl) return
    openedAuthUrlRef.current = oauth.authUrl
    openExternalUrl(oauth.authUrl)
  }, [oauth.authUrl, oauth.phase])

  const isSigningIn = oauth.phase === "starting" || oauth.phase === "waiting"

  return (
    <div
      data-testid="cloudflare-sign-in-needed"
      className="mx-5 mt-4 flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-300"
    >
      <AlertTriangle
        className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400"
        aria-hidden="true"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="text-sm font-medium text-foreground">
          <Trans>Sign in to Cloudflare again</Trans>
        </p>
        <p className="text-[12.5px] leading-5 text-muted-foreground">
          {accountName ? (
            <Trans>
              ADT Studio is no longer signed in to {accountName}, so it can't share new books or
              update shared ones. Books you already shared stay online.
            </Trans>
          ) : (
            <Trans>
              ADT Studio is no longer signed in to Cloudflare, so it can't share new books or
              update shared ones. Books you already shared stay online.
            </Trans>
          )}
        </p>
        {isSigningIn && (
          <p className="text-[12.5px] leading-5 text-muted-foreground motion-safe:animate-in motion-safe:fade-in-0">
            <Trans>Finish signing in in your browser.</Trans>{" "}
            {oauth.authUrl && (
              <a
                href={oauth.authUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-foreground underline underline-offset-2"
              >
                <Trans>Open the sign-in page</Trans>
              </a>
            )}
          </p>
        )}
        {oauth.phase === "error" && oauth.errorMessage && (
          <p
            role="alert"
            className="text-[12.5px] leading-5 text-red-700 motion-safe:animate-in motion-safe:fade-in-0 dark:text-red-400"
          >
            {oauth.errorMessage}
          </p>
        )}
      </div>
      {isSigningIn ? (
        <Button variant="ghost" size="sm" className="shrink-0" onClick={oauth.reset}>
          <Loader2 className="motion-safe:animate-spin" aria-hidden="true" />
          <Trans>Cancel</Trans>
        </Button>
      ) : (
        <Button
          size="sm"
          className="shrink-0"
          onClick={() => {
            openedAuthUrlRef.current = null
            oauth.start()
          }}
        >
          <LogIn aria-hidden="true" />
          <Trans>Sign in again</Trans>
        </Button>
      )}
    </div>
  )
}
