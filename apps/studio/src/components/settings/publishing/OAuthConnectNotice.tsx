import type { ReactNode } from "react"
import { Trans } from "@lingui/react/macro"
import { AlertTriangle, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { CloudflareOAuthErrorCode } from "@/api/client"
import { ExternalLinkButton } from "./ExternalLinkButton"

interface OAuthWaitingNoticeProps {
  authUrl: string | null
  onCancel: () => void
}

export function OAuthWaitingNotice({ authUrl, onCancel }: OAuthWaitingNoticeProps) {
  return (
    <div
      data-testid="oauth-waiting"
      aria-live="polite"
      className="flex flex-col gap-3 rounded-lg border border-primary/40 bg-primary/5 p-4 transition-colors duration-300 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:duration-300 motion-reduce:transition-none"
    >
      <span className="flex items-center gap-2.5 text-sm font-medium text-foreground">
        <Loader2
          className="size-4 shrink-0 animate-spin text-primary motion-reduce:animate-none"
          aria-hidden="true"
        />
        <Trans>Finish connecting in your browser…</Trans>
      </span>
      <p className="text-sm leading-6 text-muted-foreground">
        <Trans>
          Cloudflare just opened in your browser. Sign in there and choose <strong>Allow</strong> —
          this page carries on by itself as soon as you do.
        </Trans>
      </p>
      <p className="text-sm leading-6 text-muted-foreground">
        <Trans>
          The request will appear as <strong>Wrangler</strong> — that is Cloudflare's own developer
          tool, which ADT Studio signs in through. This is expected.
        </Trans>
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {authUrl && (
          <ExternalLinkButton href={authUrl} variant="outline">
            <Trans>Open the Cloudflare page again</Trans>
          </ExternalLinkButton>
        )}
        <Button variant="ghost" size="sm" onClick={onCancel}>
          <Trans>Cancel</Trans>
        </Button>
      </div>
    </div>
  )
}

function explain(code: CloudflareOAuthErrorCode | "unknown" | null): {
  body: ReactNode
  showRemoteHint: boolean
} {
  switch (code) {
    case "oauth_port_busy":
      return {
        body: (
          <Trans>
            Another program on this computer is already signing in to Cloudflare, so the login
            cannot come back to the Studio. Close it and try again.
          </Trans>
        ),
        showRemoteHint: true,
      }
    case "oauth_flow_pending":
      return {
        body: (
          <Trans>
            A Cloudflare login is already open in your browser. Finish it, or wait a moment and try
            again.
          </Trans>
        ),
        showRemoteHint: false,
      }
    case "oauth_denied":
      return {
        body: (
          <Trans>
            Cloudflare was not given permission, so nothing was connected. Try again and choose
            Allow on the Cloudflare page.
          </Trans>
        ),
        showRemoteHint: false,
      }
    case "oauth_expired":
      return {
        body: (
          <Trans>
            The login took too long and was cancelled. Try again — it usually takes only a few
            seconds.
          </Trans>
        ),
        showRemoteHint: true,
      }
    case "oauth_no_accounts":
      return {
        body: (
          <Trans>
            This Cloudflare login has no account the Studio can publish into. Create an account in
            Cloudflare, then connect again.
          </Trans>
        ),
        showRemoteHint: false,
      }
    default:
      return {
        body: (
          <Trans>
            The Cloudflare login could not be finished. Try again, or use an API token instead.
          </Trans>
        ),
        showRemoteHint: true,
      }
  }
}

interface OAuthErrorNoticeProps {
  code: CloudflareOAuthErrorCode | "unknown" | null
  detail: string | null
  onRetry: () => void
  onUseApiToken: () => void
}

export function OAuthErrorNotice({
  code,
  detail,
  onRetry,
  onUseApiToken,
}: OAuthErrorNoticeProps) {
  const { body, showRemoteHint } = explain(code)

  return (
    <div
      data-testid={`oauth-error-${code ?? "unknown"}`}
      className="flex flex-col gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-4 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-300"
    >
      <span className="flex items-center gap-2 text-sm font-medium text-foreground">
        <AlertTriangle className="size-4 shrink-0 text-amber-600" aria-hidden="true" />
        <Trans>We couldn't connect to Cloudflare</Trans>
      </span>
      <p className="text-sm leading-6 text-muted-foreground">{body}</p>
      {showRemoteHint && (
        <p className="text-sm leading-6 text-muted-foreground">
          <Trans>
            If ADT Studio runs on a different computer than your browser, use the API token option
            instead — the one-click login can only come back to the computer running the Studio.
          </Trans>
        </p>
      )}
      {detail && <p className="text-xs leading-5 text-muted-foreground">{detail}</p>}
      <div className="flex flex-wrap items-center gap-2 pt-0.5">
        <Button size="sm" onClick={onRetry}>
          <Trans>Try again</Trans>
        </Button>
        <Button variant="ghost" size="sm" onClick={onUseApiToken}>
          <Trans>Connect with an API token instead</Trans>
        </Button>
      </div>
    </div>
  )
}
