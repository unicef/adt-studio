import { useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { AlertTriangle, CheckCircle2, Eye, EyeOff, Loader2 } from "lucide-react"
import { CLOUDFLARE_WORKER_NAME, workersDevUrl } from "@adt/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { CloudflareVerifyResponse } from "@/api/client"
import { ExternalLinkButton } from "./ExternalLinkButton"
import { PermissionList } from "./PermissionList"
import { WizardStepShell } from "./WizardStepShell"
import { matchMissingScopes } from "./token-permissions"
import { CLOUDFLARE_API_TOKENS_URL, CLOUDFLARE_R2_URL, CLOUDFLARE_WORKERS_URL } from "./cloudflare-links"

export interface CredentialsStepProps {
  stepNumber: number
  stepCount: number
  token: string
  accountId: string
  onTokenChange: (value: string) => void
  onAccountIdChange: (value: string) => void
  onVerify: () => void
  isVerifying: boolean
  result: CloudflareVerifyResponse | null
  errorMessage: string | null
  onBack: () => void
  onContinue: () => void
}

export function CredentialsStep({
  stepNumber,
  stepCount,
  token,
  accountId,
  onTokenChange,
  onAccountIdChange,
  onVerify,
  isVerifying,
  result,
  errorMessage,
  onBack,
  onContinue,
}: CredentialsStepProps) {
  const { t } = useLingui()
  const [showToken, setShowToken] = useState(false)

  const canVerify = token.trim().length > 0 && accountId.trim().length > 0 && !isVerifying
  const tokenWorks = result?.ok === true
  const hasSubdomain = Boolean(result?.workers_dev_subdomain)
  const isReady = tokenWorks && hasSubdomain
  const { permissions: missingPermissions, unmatched } = matchMissingScopes(
    result?.missing_scopes ?? [],
  )
  const shareLinkPreview = result?.workers_dev_subdomain
    ? workersDevUrl(CLOUDFLARE_WORKER_NAME, result.workers_dev_subdomain)
    : ""

  return (
    <WizardStepShell
      stepNumber={stepNumber}
      stepCount={stepCount}
      title={<Trans>Paste your token</Trans>}
      description={
        <Trans>
          Paste the token and the Account ID you copied from Cloudflare. Both stay on this computer —
          they are only used to talk to your own Cloudflare account.
        </Trans>
      }
      footer={
        <>
          <Button variant="outline" onClick={onBack} disabled={isVerifying}>
            <Trans>Back</Trans>
          </Button>
          {isReady ? (
            <Button onClick={onContinue}>
              <Trans>Continue</Trans>
            </Button>
          ) : (
            <Button onClick={onVerify} disabled={!canVerify}>
              {isVerifying && (
                <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
              )}
              {result ? <Trans>Check again</Trans> : <Trans>Check my token</Trans>}
            </Button>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="space-y-2">
          <Label htmlFor="cloudflare-token-input">
            <Trans>Cloudflare API token</Trans>
          </Label>
          <div className="relative">
            <Input
              id="cloudflare-token-input"
              type={showToken ? "text" : "password"}
              autoComplete="off"
              spellCheck={false}
              value={token}
              onChange={(event) => onTokenChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && canVerify) onVerify()
              }}
              className="pr-10 font-mono"
              aria-describedby="cloudflare-token-hint"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-0 top-0 h-10 w-10"
              onClick={() => setShowToken((prev) => !prev)}
              aria-label={showToken ? t`Hide token` : t`Show token`}
              title={showToken ? t`Hide token` : t`Show token`}
            >
              {showToken ? (
                <EyeOff className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Eye className="h-4 w-4" aria-hidden="true" />
              )}
            </Button>
          </div>
          <p id="cloudflare-token-hint" className="text-xs leading-5 text-muted-foreground">
            <Trans>
              The long code Cloudflare showed you once, right after you created the token.
            </Trans>
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="cloudflare-account-id-input">
            <Trans>Account ID</Trans>
          </Label>
          <Input
            id="cloudflare-account-id-input"
            autoComplete="off"
            spellCheck={false}
            value={accountId}
            onChange={(event) => onAccountIdChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && canVerify) onVerify()
            }}
            className="font-mono"
            aria-describedby="cloudflare-account-id-hint"
          />
          <p id="cloudflare-account-id-hint" className="text-xs leading-5 text-muted-foreground">
            <Trans>
              A shorter code made of letters and numbers, shown in the right-hand column of Workers
              &amp; Pages in Cloudflare.
            </Trans>
          </p>
        </div>

        <div aria-live="polite" className="flex flex-col gap-3">
          {errorMessage && (
            <div
              data-testid="verify-request-error"
              className="flex flex-col gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3.5 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-top-1 motion-safe:duration-200"
            >
              <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                <AlertTriangle className="size-4 shrink-0 text-destructive" aria-hidden="true" />
                <Trans>We couldn't check your token</Trans>
              </span>
              <p className="text-sm leading-6 text-muted-foreground">
                <Trans>
                  The Studio couldn't reach Cloudflare. Check that you are online and try again.
                </Trans>
              </p>
              <p className="text-xs leading-5 text-muted-foreground">{errorMessage}</p>
            </div>
          )}

          {result && !tokenWorks && missingPermissions.length > 0 && (
            <div
              data-testid="verify-missing-scopes"
              className="flex flex-col gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3.5 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-top-1 motion-safe:duration-200"
            >
              <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                <AlertTriangle className="size-4 shrink-0 text-destructive" aria-hidden="true" />
                <Trans>Your token is missing some permissions</Trans>
              </span>
              <p className="text-sm leading-6 text-muted-foreground">
                <Trans>
                  The token works, but it isn't allowed to do everything publishing needs. Open the
                  token in Cloudflare, add the rows below, save it, then check again.
                </Trans>
              </p>
              <PermissionList
                missingIds={missingPermissions.map((permission) => permission.id)}
                onlyMissing
              />
              {unmatched.length > 0 && (
                <p className="text-xs leading-5 text-muted-foreground">
                  <Trans>Cloudflare also reported: {unmatched.join(", ")}</Trans>
                </p>
              )}
              <ExternalLinkButton href={CLOUDFLARE_API_TOKENS_URL} className="self-start">
                <Trans>Edit my token in Cloudflare</Trans>
              </ExternalLinkButton>
            </div>
          )}

          {result && !tokenWorks && result.r2_not_enabled && (
            <div
              data-testid="verify-r2-not-enabled"
              className="flex flex-col gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3.5 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-top-1 motion-safe:duration-200"
            >
              <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                <AlertTriangle className="size-4 shrink-0 text-amber-600" aria-hidden="true" />
                <Trans>Turn on R2 storage in Cloudflare first</Trans>
              </span>
              <p className="text-sm leading-6 text-muted-foreground">
                <Trans>
                  Your details work, but published books are stored in Cloudflare R2 and your
                  account hasn't switched it on yet. Open R2 in your Cloudflare dashboard and follow
                  the steps to enable it — Cloudflare asks for a payment method, but the space ADT
                  Studio uses is within the free allowance. Then check again.
                </Trans>
              </p>
              <ExternalLinkButton href={CLOUDFLARE_R2_URL} className="self-start">
                <Trans>Turn on R2 in Cloudflare</Trans>
              </ExternalLinkButton>
            </div>
          )}

          {result && !tokenWorks && missingPermissions.length === 0 && !result.r2_not_enabled && (
            <div
              data-testid="verify-rejected"
              className="flex flex-col gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3.5 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-top-1 motion-safe:duration-200"
            >
              <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                <AlertTriangle className="size-4 shrink-0 text-destructive" aria-hidden="true" />
                <Trans>Cloudflare didn't accept these details</Trans>
              </span>
              <p className="text-sm leading-6 text-muted-foreground">
                <Trans>
                  Two things to check: that the whole token was copied, with no spaces at either
                  end, and that the Account ID belongs to the same account you made the token in.
                </Trans>
              </p>
            </div>
          )}

          {tokenWorks && !hasSubdomain && (
            <div
              data-testid="verify-no-subdomain"
              className="flex flex-col gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3.5 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-top-1 motion-safe:duration-200"
            >
              <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                <AlertTriangle className="size-4 shrink-0 text-amber-600" aria-hidden="true" />
                <Trans>Your account needs a web address first</Trans>
              </span>
              <p className="text-sm leading-6 text-muted-foreground">
                <Trans>
                  Your token works. But your Cloudflare account hasn't chosen the web address it
                  will use for services yet, and your share links need it. Open Workers &amp; Pages
                  in Cloudflare and pick a name when it asks — anything is fine, it just becomes
                  part of your links. Then come back and check again.
                </Trans>
              </p>
              <ExternalLinkButton href={CLOUDFLARE_WORKERS_URL} className="self-start">
                <Trans>Open Workers &amp; Pages</Trans>
              </ExternalLinkButton>
            </div>
          )}

          {isReady && (
            <div
              data-testid="verify-success"
              className="flex flex-col gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-3.5 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95 motion-safe:duration-200"
            >
              <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                <CheckCircle2 className="size-4 shrink-0 text-emerald-600" aria-hidden="true" />
                {result?.account_name ? (
                  <Trans>Connected as {result.account_name}</Trans>
                ) : (
                  <Trans>Your token works</Trans>
                )}
              </span>
              <p className="text-sm leading-6 text-muted-foreground">
                <Trans>
                  Your share links will start with {shareLinkPreview}. Nothing has been created in
                  your account yet — that's the next step.
                </Trans>
              </p>
            </div>
          )}
        </div>
      </div>
    </WizardStepShell>
  )
}
