import type { ReactNode } from "react"
import { Trans } from "@lingui/react/macro"
import { ArrowRight, Check, Cloud, Github, Loader2, ShieldCheck, Wifi } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ComingSoon } from "@/components/app/screens/settings/ui"
import { cn } from "@/lib/utils"
import type { CloudflareOAuthErrorCode } from "@/api/client"
import type { CloudflareOAuthPhase } from "@/hooks/use-cloudflare-oauth"
import { ExternalLinkButton } from "./ExternalLinkButton"
import { OAuthErrorNotice } from "./OAuthConnectNotice"
import { RadioDot } from "./RadioDot"
import { WizardStepShell } from "./WizardStepShell"
import { CLOUDFLARE_SIGNUP_URL } from "./cloudflare-links"

const CLOUDFLARE_ORANGE = "#f6821f"

/** A miniature browser window. Painted from the theme so the scene sits inside a dark card as
 *  naturally as a light one, instead of glowing white in the middle of it. */
const WINDOW = "rounded-lg border bg-background shadow-md dark:bg-card dark:shadow-black/40"

function SceneSignIn() {
  return (
    <div className="flex h-full flex-col gap-1.5 p-2.5">
      <div className="flex items-center gap-1">
        <span className="size-1.5 rounded-full bg-border" />
        <span className="size-1.5 rounded-full bg-border" />
        <span className="size-1.5 rounded-full bg-border" />
        <span className="ml-2 flex flex-1 items-center gap-1 rounded-full border bg-background px-2 py-0.5 text-[9px] leading-3 text-muted-foreground dark:bg-card">
          <Trans>dash.cloudflare.com</Trans>
        </span>
      </div>
      <div className="flex flex-1 items-center justify-center">
        <div className={`flex w-[72%] max-w-64 flex-col gap-1.5 p-3 ${WINDOW}`}>
          <div className="flex items-center justify-center gap-1">
            <Cloud className="size-4 shrink-0" style={{ color: CLOUDFLARE_ORANGE }} aria-hidden="true" />
            <span className="text-[10px] font-bold tracking-tight text-foreground">
              <Trans>CLOUDFLARE</Trans>
            </span>
          </div>
          <span className="text-center text-[9px] leading-3 text-muted-foreground">
            <Trans>Log in to your account</Trans>
          </span>
          <span className="flex h-5 items-center rounded border bg-muted/40 px-1.5 text-[8px] leading-3 text-muted-foreground/70">
            <Trans>you@example.com</Trans>
          </span>
          <span className="flex h-5 items-center rounded border bg-muted/40 px-1.5 text-[8px] leading-3 tracking-[0.2em] text-muted-foreground/70">
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
      <div className={`flex w-[78%] max-w-72 flex-col gap-2 p-3.5 ${WINDOW}`}>
        <div className="flex items-center gap-1.5">
          <Cloud className="size-4.5 shrink-0" style={{ color: CLOUDFLARE_ORANGE }} aria-hidden="true" />
          <span className="text-[11px] font-semibold leading-4 text-foreground/80">
            <Trans>Wrangler</Trans>
          </span>
        </div>
        <span className="h-2 w-full rounded-full bg-muted" />
        <span className="h-2 w-4/5 rounded-full bg-muted" />
        <span className="h-2 w-2/3 rounded-full bg-muted" />
        <div className="mt-1 flex items-center justify-end gap-1.5">
          <span className="rounded border px-2 py-1 text-[10px] leading-3 text-muted-foreground">
            <Trans>Deny</Trans>
          </span>
          <span className="rounded bg-primary px-2.5 py-1 text-[10px] font-semibold leading-3 text-primary-foreground ring-2 ring-primary/30">
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
      <div className={`flex w-[78%] max-w-72 flex-col gap-2 p-3 ${WINDOW}`}>
        <div className="flex items-center justify-between">
          <span className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
            <Trans>Setting up</Trans>
          </span>
          <span className="text-[9px] tabular-nums text-muted-foreground/70">3/7</span>
        </div>
        <span className="h-1 overflow-hidden rounded-full bg-muted">
          <span className="block h-full w-1/3 rounded-full bg-primary" />
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
                className="size-3.5 shrink-0 animate-spin text-primary motion-reduce:animate-none"
                aria-hidden="true"
              />
            )}
            {row.state === "pending" && (
              <span className="size-3.5 shrink-0 rounded-full border-2 border-border" />
            )}
            <span
              className={
                row.state === "pending"
                  ? "text-[9px] leading-3.5 text-muted-foreground/60"
                  : row.state === "running"
                    ? "text-[9px] font-medium leading-3.5 text-foreground"
                    : "text-[9px] leading-3.5 text-muted-foreground"
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

/**
 * Where a shared book can live. Cloudflare is the one that works today; the other two are
 * listed so the choice reads as a choice — and so nobody wonders whether GitHub or a school's
 * own network were considered. They are stubs on purpose: nothing behind them is built.
 */
function DestinationTile({
  icon,
  name,
  detail,
  selected = false,
}: {
  icon: ReactNode
  name: ReactNode
  detail: ReactNode
  selected?: boolean
}) {
  return (
    <div
      role="radio"
      aria-checked={selected}
      aria-disabled={selected ? undefined : true}
      className={cn(
        "flex items-center gap-2.5 rounded-xl border px-3 py-2.5 transition-colors duration-200 motion-reduce:transition-none",
        selected
          ? "border-primary/50 bg-brand-50 ring-1 ring-primary/25"
          : "border-dashed bg-card text-muted-foreground",
      )}
    >
      <span
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-lg",
          selected ? "bg-background shadow-sm ring-1 ring-border" : "bg-muted/60",
        )}
      >
        {icon}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span
          className={cn(
            "truncate text-[13px] font-semibold",
            selected ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {name}
        </span>
        <span className="truncate text-[11px] leading-4 text-muted-foreground">{detail}</span>
      </span>
      {selected ? <RadioDot selected /> : <ComingSoon label={<Trans>Coming soon</Trans>} />}
    </div>
  )
}

function JourneyCard({
  number,
  scene,
  title,
  caption,
  index,
}: {
  number: string
  scene: ReactNode
  title: ReactNode
  caption: ReactNode
  index: number
}) {
  return (
    <div
      style={{ animationDelay: `${index * 70}ms`, animationFillMode: "both" }}
      className="flex h-full flex-col overflow-hidden rounded-xl border bg-card motion-safe:animate-wizard-enter"
    >
      <div className="relative min-h-52 flex-1 border-b bg-muted/40">
        <span className="absolute left-2.5 top-2.5 z-10 flex size-5 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
          {number}
        </span>
        {scene}
      </div>
      <div className="flex min-h-24 shrink-0 flex-col gap-1 p-4">
        <span className="text-sm font-semibold tracking-tight text-foreground">{title}</span>
        <span className="text-xs leading-5 text-muted-foreground">{caption}</span>
      </div>
    </div>
  )
}

interface ConnectStepProps {
  oauthPhase: CloudflareOAuthPhase
  oauthErrorCode: CloudflareOAuthErrorCode | "unknown" | null
  oauthErrorMessage: string | null
  authUrl: string | null
  onConnectWithCloudflare: () => void
  onCancelOAuth: () => void
}

export function ConnectStep({
  oauthPhase,
  oauthErrorCode,
  oauthErrorMessage,
  authUrl,
  onConnectWithCloudflare,
  onCancelOAuth,
}: ConnectStepProps) {
  const isBusy = oauthPhase === "starting" || oauthPhase === "waiting"
  const showJourney = oauthPhase !== "error"

  return (
    <WizardStepShell
      title={<Trans>Connect your Cloudflare account</Trans>}
      description={
        <Trans>Your books will live in your own Cloudflare account.</Trans>
      }
      footer={
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
      }
    >
      <div className="flex flex-1 flex-col gap-5 pt-1">
        <div className="flex flex-col gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <Trans>Hosting</Trans>
          </span>
          <div role="radiogroup" className="grid gap-2 sm:grid-cols-3">
            <DestinationTile
              selected
              icon={<Cloud className="size-4" style={{ color: CLOUDFLARE_ORANGE }} aria-hidden="true" />}
              name={<Trans>Cloudflare</Trans>}
              detail={<Trans>Free plan, in your own account</Trans>}
            />
            <DestinationTile
              icon={<Github className="size-4" aria-hidden="true" />}
              name={<Trans>GitHub</Trans>}
              detail={<Trans>Host from a repository you own</Trans>}
            />
            <DestinationTile
              icon={<Wifi className="size-4" aria-hidden="true" />}
              name={<Trans>Local network</Trans>}
              detail={<Trans>Inside the school, no internet needed</Trans>}
            />
          </div>
        </div>

        {showJourney && (
        <div className="grid flex-1 auto-rows-fr gap-3 sm:grid-cols-3">
          <JourneyCard
            index={0}
            number="1"
            scene={<SceneSignIn />}
            title={<Trans>Sign in at Cloudflare</Trans>}
            caption={<Trans>Your browser opens Cloudflare's own sign-in page.</Trans>}
          />
          <JourneyCard
            index={1}
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
            index={2}
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
            className="mt-auto flex flex-wrap items-center gap-3 rounded-xl border border-brand-200 bg-brand-50 p-4 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:duration-300"
          >
            <Loader2
              className="size-4 shrink-0 animate-spin text-brand-600 motion-reduce:animate-none"
              aria-hidden="true"
            />
            <p className="min-w-0 flex-1 text-sm leading-6 text-foreground/80">
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
        <div className="mt-auto flex items-center gap-3 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.07] p-4">
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
