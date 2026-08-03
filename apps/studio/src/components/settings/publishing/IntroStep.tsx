import { Trans } from "@lingui/react/macro"
import { Clock, Cloud, Loader2, MessagesSquare, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { CloudflareOAuthErrorCode } from "@/api/client"
import type { CloudflareOAuthPhase } from "@/hooks/use-cloudflare-oauth"
import { ExternalLinkButton } from "./ExternalLinkButton"
import { OAuthErrorNotice, OAuthWaitingNotice } from "./OAuthConnectNotice"
import { WizardStepShell } from "./WizardStepShell"
import { CLOUDFLARE_SIGNUP_URL } from "./cloudflare-links"

const POINTS = [
  {
    id: "account",
    icon: Cloud,
    title: <Trans>You need a free Cloudflare account</Trans>,
    body: (
      <Trans>
        Cloudflare is the company that will store your published books and show them to readers.
        Signing up takes a couple of minutes, and their free plan covers normal classroom use.
      </Trans>
    ),
  },
  {
    id: "ownership",
    icon: ShieldCheck,
    title: <Trans>Your book goes into your own account</Trans>,
    body: (
      <Trans>
        The copy is uploaded to your Cloudflare account — not to us. Only people you send the link
        to can open it, and you can switch a link off whenever you want.
      </Trans>
    ),
  },
  {
    id: "comments",
    icon: MessagesSquare,
    title: <Trans>Readers can comment on the pages</Trans>,
    body: (
      <Trans>
        Whoever opens your link can leave notes directly on a page, like sticky notes. You read and
        answer them here in the Studio.
      </Trans>
    ),
  },
  {
    id: "time",
    icon: Clock,
    title: <Trans>One click, then you're done</Trans>,
    body: (
      <Trans>
        Sign in to Cloudflare once and allow ADT Studio. After that, publishing a book is one
        click.
      </Trans>
    ),
  },
]

interface IntroStepProps {
  stepNumber: number
  stepCount: number
  oauthPhase: CloudflareOAuthPhase
  oauthErrorCode: CloudflareOAuthErrorCode | "unknown" | null
  oauthErrorMessage: string | null
  authUrl: string | null
  onConnectWithCloudflare: () => void
  onCancelOAuth: () => void
  onUseApiToken: () => void
}

export function IntroStep({
  stepNumber,
  stepCount,
  oauthPhase,
  oauthErrorCode,
  oauthErrorMessage,
  authUrl,
  onConnectWithCloudflare,
  onCancelOAuth,
  onUseApiToken,
}: IntroStepProps) {
  const isBusy = oauthPhase === "starting" || oauthPhase === "waiting"

  return (
    <WizardStepShell
      stepNumber={stepNumber}
      stepCount={stepCount}
      title={<Trans>Share your book with a link</Trans>}
      description={
        <Trans>
          Publishing puts a copy of your finished book on the web and gives you one link to share.
          Anyone with the link can read the book in a browser — nothing to install — and leave
          comments for you.
        </Trans>
      }
      footer={
        <>
          <Button onClick={onConnectWithCloudflare} disabled={isBusy}>
            {isBusy && (
              <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
            )}
            <Trans>Connect with Cloudflare</Trans>
          </Button>
          <ExternalLinkButton href={CLOUDFLARE_SIGNUP_URL} variant="ghost">
            <Trans>Create a free Cloudflare account</Trans>
          </ExternalLinkButton>
        </>
      }
    >
      <ul className="grid gap-3 sm:grid-cols-2">
        {POINTS.map(({ id, icon: Icon, title, body }) => (
          <li
            key={id}
            className="flex flex-col gap-1.5 rounded-lg border bg-muted/30 p-3.5 transition-colors duration-200 motion-reduce:transition-none"
          >
            <span className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              {title}
            </span>
            <p className="text-sm leading-6 text-muted-foreground">{body}</p>
          </li>
        ))}
      </ul>

      {oauthPhase === "waiting" && (
        <OAuthWaitingNotice authUrl={authUrl} onCancel={onCancelOAuth} />
      )}

      {oauthPhase === "error" && (
        <OAuthErrorNotice
          code={oauthErrorCode}
          detail={oauthErrorMessage}
          onRetry={onConnectWithCloudflare}
          onUseApiToken={onUseApiToken}
        />
      )}

      <div className="flex flex-col gap-1 border-t pt-4">
        <Button
          variant="link"
          className="h-auto self-start p-0 text-sm"
          onClick={onUseApiToken}
          disabled={isBusy}
        >
          <Trans>Connect with an API token instead</Trans>
        </Button>
        <p className="text-sm leading-6 text-muted-foreground">
          <Trans>
            Use this if the Studio runs on a different computer or a server, where the one-click
            login cannot come back to your browser.
          </Trans>
        </p>
      </div>
    </WizardStepShell>
  )
}
