import type { ReactNode } from "react"
import { Trans } from "@lingui/react/macro"
import { ArrowRight, Check, Cloud, Loader2, MessageSquareOff, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { CloudflareOAuthErrorCode } from "@/api/client"
import type { CloudflareOAuthPhase } from "@/hooks/use-cloudflare-oauth"
import { ExternalLinkButton } from "./ExternalLinkButton"
import { OAuthErrorNotice } from "./OAuthConnectNotice"
import { WizardStepShell } from "./WizardStepShell"
import { CLOUDFLARE_SIGNUP_URL } from "./cloudflare-links"

function SceneSignIn() {
  return (
    <div className="flex h-full flex-col gap-1.5 p-2.5">
      <div className="flex items-center gap-1">
        <span className="size-1.5 rounded-full bg-zinc-300" />
        <span className="size-1.5 rounded-full bg-zinc-300" />
        <span className="size-1.5 rounded-full bg-zinc-300" />
        <span className="ml-2 flex flex-1 items-center gap-1 rounded-full border bg-white px-2 py-0.5 text-[9px] leading-3 text-zinc-500">
          <Trans>dash.cloudflare.com</Trans>
        </span>
      </div>
      <div className="flex flex-1 items-center justify-center">
        <div className="flex w-full max-w-44 flex-col gap-1.5 rounded-lg border bg-white p-3 shadow-md">
          <div className="flex items-center justify-center gap-1">
            <Cloud className="size-4 shrink-0" style={{ color: "#f6821f" }} aria-hidden="true" />
            <span className="text-[10px] font-bold tracking-tight text-zinc-800">
              <Trans>CLOUDFLARE</Trans>
            </span>
          </div>
          <span className="text-center text-[9px] leading-3 text-zinc-500">
            <Trans>Log in to your account</Trans>
          </span>
          <span className="flex h-5 items-center rounded border bg-zinc-50 px-1.5 text-[8px] leading-3 text-zinc-400">
            <Trans>you@example.com</Trans>
          </span>
          <span className="flex h-5 items-center rounded border bg-zinc-50 px-1.5 text-[8px] leading-3 tracking-[0.2em] text-zinc-400">
            ••••••••
          </span>
          <span className="flex h-5 items-center justify-center rounded bg-[#0051c3] text-[9px] font-semibold leading-3 text-white">
            <Trans>Log in</Trans>
          </span>
        </div>
      </div>
    </div>
  )
}

function SceneAllow() {
  return (
    <div className="flex h-full items-center justify-center p-3">
      <div className="flex w-full max-w-52 flex-col gap-2 rounded-lg border bg-white p-3.5 shadow-md">
        <div className="flex items-center gap-1.5">
          <Cloud className="size-4.5 shrink-0" style={{ color: "#f6821f" }} aria-hidden="true" />
          <span className="text-[11px] font-semibold leading-4 text-zinc-700">
            <Trans>Wrangler</Trans>
          </span>
        </div>
        <span className="h-2 w-full rounded-full bg-zinc-100" />
        <span className="h-2 w-4/5 rounded-full bg-zinc-100" />
        <span className="h-2 w-2/3 rounded-full bg-zinc-100" />
        <div className="mt-1 flex items-center justify-end gap-1.5">
          <span className="rounded border px-2 py-1 text-[10px] leading-3 text-zinc-400">
            <Trans>Deny</Trans>
          </span>
          <span className="rounded bg-indigo-600 px-2.5 py-1 text-[10px] font-semibold leading-3 text-white ring-2 ring-indigo-200">
            <Trans>Allow</Trans>
          </span>
        </div>
      </div>
    </div>
  )
}

function SceneSetup() {
  const rows: Array<{ state: "done" | "running" | "pending"; label: ReactNode }> = [
    { state: "done", label: <Trans>Checking your account</Trans> },
    { state: "done", label: <Trans>Creating the database</Trans> },
    { state: "running", label: <Trans>Installing the service</Trans> },
    { state: "pending", label: <Trans>Setting up your web address</Trans> },
  ]

  return (
    <div className="flex h-full items-center justify-center p-3">
      <div className="flex w-full max-w-52 flex-col gap-2 rounded-lg border bg-white p-3 shadow-md">
        <div className="flex items-center justify-between">
          <span className="text-[9px] font-semibold uppercase tracking-wide text-zinc-500">
            <Trans>Setting up</Trans>
          </span>
          <span className="text-[9px] tabular-nums text-zinc-400">3/8</span>
        </div>
        <span className="h-1 overflow-hidden rounded-full bg-zinc-100">
          <span className="block h-full w-1/3 rounded-full bg-indigo-500" />
        </span>
        {rows.map((row, index) => (
          <div key={index} className="flex items-center gap-1.5">
            {row.state === "done" && (
              <span className="flex size-3.5 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
                <Check className="size-2.5" aria-hidden="true" />
              </span>
            )}
            {row.state === "running" && (
              <Loader2
                className="size-3.5 shrink-0 animate-spin text-indigo-600 motion-reduce:animate-none"
                aria-hidden="true"
              />
            )}
            {row.state === "pending" && (
              <span className="size-3.5 shrink-0 rounded-full border-2 border-zinc-200" />
            )}
            <span
              className={
                row.state === "pending"
                  ? "text-[9px] leading-3.5 text-zinc-400"
                  : row.state === "running"
                    ? "text-[9px] font-medium leading-3.5 text-zinc-700"
                    : "text-[9px] leading-3.5 text-zinc-500"
              }
            >
              {row.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function JourneyCard({
  number,
  scene,
  title,
  caption,
}: {
  number: string
  scene: ReactNode
  title: ReactNode
  caption: ReactNode
}) {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border bg-card">
      <div className="relative h-44 border-b bg-zinc-50/70 mh:h-24">
        <span className="absolute left-2.5 top-2.5 z-10 flex size-5 items-center justify-center rounded-full bg-indigo-700 text-[11px] font-semibold text-white">
          {number}
        </span>
        {scene}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-4">
        <span className="text-sm font-semibold tracking-tight text-foreground">{title}</span>
        <span className="text-xs leading-5 text-muted-foreground">{caption}</span>
      </div>
    </div>
  )
}

interface ConnectStepProps {
  withComments: boolean
  oauthPhase: CloudflareOAuthPhase
  oauthErrorCode: CloudflareOAuthErrorCode | "unknown" | null
  oauthErrorMessage: string | null
  authUrl: string | null
  onBack: () => void
  onConnectWithCloudflare: () => void
  onCancelOAuth: () => void
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
}: ConnectStepProps) {
  const isBusy = oauthPhase === "starting" || oauthPhase === "waiting"
  const showJourney = oauthPhase !== "error"

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
        <>
          <Button variant="ghost" onClick={onBack} disabled={isBusy}>
            <Trans>Back</Trans>
          </Button>
          <Button className="group ml-auto" onClick={onConnectWithCloudflare} disabled={isBusy}>
            {isBusy ? (
              <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
            ) : null}
            <Trans>Connect with Cloudflare</Trans>
            {!isBusy && (
              <ArrowRight
                className="size-4 transition-transform duration-200 motion-safe:group-hover:translate-x-0.5 motion-reduce:transition-none"
                aria-hidden="true"
              />
            )}
          </Button>
        </>
      }
    >
      <div className="flex flex-1 flex-col gap-5 pt-1 mh:gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1.5 rounded-full border bg-card px-3 py-1 text-xs text-muted-foreground">
            <Trans>Hosting</Trans>
            <Cloud className="size-3.5" style={{ color: "#f6821f" }} aria-hidden="true" />
            <span className="font-medium text-foreground">
              <Trans>Cloudflare</Trans>
            </span>
          </span>
          <span className="flex items-center gap-1.5 rounded-full border bg-card px-3 py-1 text-xs text-muted-foreground">
            <Trans>Feedback</Trans>
            {withComments ? (
              <>
                <Cloud className="size-3.5" style={{ color: "#f6821f" }} aria-hidden="true" />
                <span className="font-medium text-foreground">
                  <Trans>Cloudflare</Trans>
                </span>
              </>
            ) : (
              <>
                <MessageSquareOff className="size-3.5 text-zinc-400" aria-hidden="true" />
                <span className="font-medium text-foreground">
                  <Trans>Skipped for now</Trans>
                </span>
              </>
            )}
          </span>
        </div>

        {showJourney && (
        <div className="grid gap-3 sm:grid-cols-3">
          <JourneyCard
            number="1"
            scene={<SceneSignIn />}
            title={<Trans>Sign in at Cloudflare</Trans>}
            caption={<Trans>Your browser opens Cloudflare's own sign-in page.</Trans>}
          />
          <JourneyCard
            number="2"
            scene={<SceneAllow />}
            title={<Trans>Click Allow</Trans>}
            caption={
              <Trans>
                The request appears as <strong>Wrangler</strong> — Cloudflare's own tool, which ADT
                Studio signs in through. This is expected.
              </Trans>
            }
          />
          <JourneyCard
            number="3"
            scene={<SceneSetup />}
            title={<Trans>We set everything up</Trans>}
            caption={<Trans>ADT Studio prepares your account automatically — about a minute.</Trans>}
          />
        </div>
        )}

        {showJourney && oauthPhase === "waiting" && (
          <div
            data-testid="oauth-waiting"
            aria-live="polite"
            className="mt-auto flex flex-wrap items-center gap-3 rounded-xl border border-indigo-200 bg-indigo-50/60 p-4 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:duration-300"
          >
            <Loader2
              className="size-4 shrink-0 animate-spin text-indigo-700 motion-reduce:animate-none"
              aria-hidden="true"
            />
            <p className="min-w-0 flex-1 text-sm leading-6 text-muted-foreground">
              <Trans>
                Waiting for your approval in the browser — choose <strong>Allow</strong> on the
                Cloudflare page. It appears as <strong>Wrangler</strong>; that's expected.
              </Trans>
            </p>
            <span className="flex shrink-0 items-center gap-2">
              {authUrl && (
                <ExternalLinkButton href={authUrl} variant="outline" size="sm">
                  <Trans>Open the Cloudflare page again</Trans>
                </ExternalLinkButton>
              )}
              <Button variant="ghost" size="sm" onClick={onCancelOAuth}>
                <Trans>Cancel</Trans>
              </Button>
            </span>
          </div>
        )}

        {showJourney && oauthPhase !== "waiting" && (
        <div className="mt-auto flex items-center gap-3 rounded-xl border border-emerald-200/80 bg-emerald-50/50 p-4">
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-white">
            <ShieldCheck className="size-3.5" aria-hidden="true" />
            <Trans>Free</Trans>
          </span>
          <p className="text-sm leading-6 text-muted-foreground">
            <Trans>
              Everything here runs on Cloudflare's <strong>free plan</strong> — no payment needed
              for normal classroom use. Your books are uploaded to your own account, not to us.
            </Trans>{" "}
            <ExternalLinkButton
              href={CLOUDFLARE_SIGNUP_URL}
              variant="link"
              className="h-auto p-0 text-sm"
            >
              <Trans>Create a free account first</Trans>
            </ExternalLinkButton>
          </p>
        </div>
        )}

        {oauthPhase === "error" && (
          <OAuthErrorNotice
            code={oauthErrorCode}
            detail={oauthErrorMessage}
            onRetry={onConnectWithCloudflare}
          />
        )}
      </div>
    </WizardStepShell>
  )
}
