import { Trans } from "@lingui/react/macro"
import { Cloud, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { CloudflareOAuthErrorCode } from "@/api/client"
import type { CloudflareOAuthPhase } from "@/hooks/use-cloudflare-oauth"
import { ExternalLinkButton } from "./ExternalLinkButton"
import { OAuthErrorNotice, OAuthWaitingNotice } from "./OAuthConnectNotice"
import { WizardStepShell } from "./WizardStepShell"
import { CLOUDFLARE_SIGNUP_URL } from "./cloudflare-links"

interface ConnectStepProps {
  withComments: boolean
  oauthPhase: CloudflareOAuthPhase
  oauthErrorCode: CloudflareOAuthErrorCode | "unknown" | null
  oauthErrorMessage: string | null
  authUrl: string | null
  onBack: () => void
  onConnectWithCloudflare: () => void
  onCancelOAuth: () => void
  onUseApiToken: () => void
}

export function ConnectStep({
  withComments,
  oauthPhase,
  oauthErrorCode,
  oauthErrorMessage,
  authUrl,
  onBack,
  onConnectWithCloudflare,
  onCancelOAuth,
  onUseApiToken,
}: ConnectStepProps) {
  const isBusy = oauthPhase === "starting" || oauthPhase === "waiting"

  return (
    <WizardStepShell
      title={<Trans>Connect your Cloudflare account</Trans>}
      description={
        withComments ? (
          <Trans>
            Your books and their reviewer comments will both live in your own Cloudflare account.
          </Trans>
        ) : (
          <Trans>Your books will live in your own Cloudflare account.</Trans>
        )
      }
      footer={
        <Button variant="ghost" onClick={onBack} disabled={isBusy}>
          <Trans>Back</Trans>
        </Button>
      }
    >
      <div className="flex flex-col gap-3 rounded-xl border border-indigo-200/80 bg-indigo-50/40 p-4 sm:p-5">
        <div className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white text-indigo-700 shadow-sm ring-1 ring-indigo-200">
            <Cloud className="size-5" aria-hidden="true" />
          </span>
          <p className="text-sm leading-6 text-muted-foreground">
            <Trans>
              You need a free Cloudflare account — signing up takes a couple of minutes. Your books
              are uploaded there, not to us, and only people with your link can open them.
            </Trans>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={onConnectWithCloudflare} disabled={isBusy}>
            {isBusy && (
              <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
            )}
            <Trans>Connect with Cloudflare</Trans>
          </Button>
          <ExternalLinkButton href={CLOUDFLARE_SIGNUP_URL} variant="ghost">
            <Trans>Create a free account first</Trans>
          </ExternalLinkButton>
        </div>

        <div className="flex flex-col gap-1 border-t border-indigo-100 pt-3">
          <Button
            variant="link"
            className="h-auto self-start p-0 text-sm"
            onClick={onUseApiToken}
            disabled={isBusy}
          >
            <Trans>Connect with an API token instead</Trans>
          </Button>
          <p className="text-xs leading-5 text-muted-foreground">
            <Trans>
              For when the Studio runs on a different computer or a server, where the one-click
              login cannot come back to your browser.
            </Trans>
          </p>
        </div>
      </div>

      {oauthPhase === "waiting" && <OAuthWaitingNotice authUrl={authUrl} onCancel={onCancelOAuth} />}

      {oauthPhase === "error" && (
        <OAuthErrorNotice
          code={oauthErrorCode}
          detail={oauthErrorMessage}
          onRetry={onConnectWithCloudflare}
          onUseApiToken={onUseApiToken}
        />
      )}
    </WizardStepShell>
  )
}
