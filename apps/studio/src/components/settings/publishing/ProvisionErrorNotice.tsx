import type { ReactNode } from "react"
import { Trans } from "@lingui/react/macro"
import { AlertTriangle } from "lucide-react"
import type { ProvisionFailure } from "@/hooks/use-cloudflare-provision"
import { ExternalLinkButton } from "./ExternalLinkButton"
import { PermissionList } from "./PermissionList"
import { matchMissingScopes } from "./token-permissions"
import { CLOUDFLARE_R2_URL, CLOUDFLARE_WORKERS_URL } from "./cloudflare-links"

function title(failure: ProvisionFailure): ReactNode {
  switch (failure.code) {
    case "bad_token_scope":
      return <Trans>Some permissions are missing</Trans>
    case "r2_not_enabled":
      return <Trans>Turn on R2 storage in Cloudflare first</Trans>
    case "account_not_found":
      return <Trans>Cloudflare didn't recognise that Account ID</Trans>
    case "no_workers_subdomain":
      return <Trans>Your account needs a web address first</Trans>
    case "name_collision":
      return <Trans>A name in your Cloudflare account is already taken</Trans>
    case "migration_failed":
      return <Trans>The database couldn't be prepared</Trans>
    case "upload_failed":
      return <Trans>The publishing service couldn't be installed</Trans>
    case "stale_deployment":
      return <Trans>Your service isn't answering yet</Trans>
    case "partial_provision":
      return <Trans>Setup stopped partway</Trans>
    default:
      return <Trans>Setup couldn't finish</Trans>
  }
}

function body(failure: ProvisionFailure): ReactNode {
  switch (failure.code) {
    case "bad_token_scope":
      return (
        <Trans>
          The Cloudflare sign-in did not grant everything publishing needs. Disconnect, connect
          again, and allow every permission ADT Studio asks for. Nothing was created in your
          account.
        </Trans>
      )
    case "r2_not_enabled":
      return (
        <Trans>
          Published books are stored in Cloudflare R2, and your account hasn't switched it on yet.
          Open R2 in your Cloudflare dashboard and follow the steps to enable it — Cloudflare asks
          for a payment method, but the space ADT Studio uses is within the free allowance. Then
          come back and try again. Nothing was created in your account.
        </Trans>
      )
    case "account_not_found":
      return (
        <Trans>
          Check that the Account ID belongs to the same Cloudflare account you created the token in.
          Nothing was created in your account.
        </Trans>
      )
    case "no_workers_subdomain":
      return (
        <Trans>
          Your Cloudflare account hasn't chosen the web address it uses for services yet, and your
          share links need it. Open Workers &amp; Pages, pick any name when it asks, then try again.
        </Trans>
      )
    case "name_collision":
      return (
        <Trans>
          Something else in your account already uses the name the Studio needs. Rename it in
          Cloudflare, or write to us if you'd rather not — then try again.
        </Trans>
      )
    case "migration_failed":
      return (
        <Trans>
          Nothing was lost — the database is left exactly as it was. Trying again usually fixes
          this. If it keeps happening, send us the details below.
        </Trans>
      )
    case "upload_failed":
      return (
        <Trans>
          This is nearly always a passing network problem. Try again — the parts already set up are
          kept, so it picks up where it left off.
        </Trans>
      )
    case "stale_deployment":
      return (
        <Trans>
          Everything was installed, but Cloudflare sometimes takes a minute to switch on a brand-new
          web address. Wait a moment and try again.
        </Trans>
      )
    case "partial_provision":
      return (
        <Trans>
          Nothing is broken and nothing was lost. Trying again continues from where it stopped.
        </Trans>
      )
    default:
      return (
        <Trans>
          The setup stopped before it finished. Nothing was lost — trying again continues from where
          it stopped.
        </Trans>
      )
  }
}

function action(failure: ProvisionFailure): ReactNode {
  if (failure.code === "r2_not_enabled") {
    return (
      <ExternalLinkButton href={CLOUDFLARE_R2_URL} className="self-start">
        <Trans>Turn on R2 in Cloudflare</Trans>
      </ExternalLinkButton>
    )
  }
  if (failure.code === "no_workers_subdomain") {
    return (
      <ExternalLinkButton href={CLOUDFLARE_WORKERS_URL} className="self-start">
        <Trans>Open Workers &amp; Pages</Trans>
      </ExternalLinkButton>
    )
  }
  return null
}

interface ProvisionErrorNoticeProps {
  failure: ProvisionFailure
  children?: ReactNode
}

export function ProvisionErrorNotice({ failure, children }: ProvisionErrorNoticeProps) {
  const { permissions } = matchMissingScopes(failure.missingScopes)

  return (
    <div
      data-testid={`provision-error-${failure.code}`}
      className="flex flex-col gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3.5 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-top-1 motion-safe:duration-200"
    >
      <span className="flex items-center gap-2 text-sm font-medium text-foreground">
        <AlertTriangle className="size-4 shrink-0 text-destructive" aria-hidden="true" />
        {title(failure)}
      </span>
      <p className="text-sm leading-6 text-muted-foreground">{body(failure)}</p>
      {permissions.length > 0 && (
        <PermissionList missingIds={permissions.map((permission) => permission.id)} onlyMissing />
      )}
      {failure.detail && (
        <p className="text-xs leading-5 text-muted-foreground">{failure.detail}</p>
      )}
      {action(failure)}
      {children}
    </div>
  )
}
