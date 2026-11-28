import { useEffect } from "react"
import { Link } from "@tanstack/react-router"
import { Trans } from "@lingui/react/macro"
import { Loader2, Plug, RotateCcw, WifiOff } from "lucide-react"
import { PrimaryButton } from "../../core/ui"
import { ErrorState, SecondaryButton } from "./ErrorState"

/**
 * Why the AI setup stopped. `auth`: the provider rejected the key. `quota`: a usage or rate limit.
 * `offline`: no connection to the provider. `unknown`: anything else, e.g. an answer that didn't
 * match what the setup expects. `classifySetupError` sorts the recommender's errors into these.
 */
export type SetupErrorKind = "auth" | "quota" | "offline" | "unknown"


/** The loader's error state. "Set it up myself" keeps the PDF and opens the manual setup; nothing is lost. */
export function SetupError({ kind, detail, onRetry, onManual }: { kind: SetupErrorKind; detail: string; onRetry: () => void; onManual: () => void }) {
  useEffect(() => {
    if (kind !== "offline") return
    window.addEventListener("online", onRetry)
    return () => window.removeEventListener("online", onRetry)
  }, [kind, onRetry])

  const manual = (
    <SecondaryButton onClick={onManual}>
      <Trans>Set it up myself</Trans>
    </SecondaryButton>
  )
  const retry = (
    <PrimaryButton onClick={onRetry} icon={<RotateCcw className="size-4 transition-transform duration-300 group-hover:-rotate-45" />}>
      <Trans>Try again</Trans>
    </PrimaryButton>
  )

  if (kind === "auth")
    return (
      <ErrorState
        title={<Trans>Your AI provider needs attention</Trans>}
        body={<Trans>Your AI provider didn&apos;t accept the API key. Update it in Settings, or set this book up yourself.</Trans>}
        detail={detail}
        actions={
          <>
            {manual}
            <Link to="/settings/providers" className="group inline-flex h-11 items-center gap-2 rounded-full bg-brand-600 px-6 text-[14.5px] font-semibold text-primary-foreground shadow-[0_8px_22px_rgba(43,127,255,0.35)] transition-[transform,background-color] duration-200 hover:bg-brand-600/90 active:scale-[0.97]">
              <Plug className="size-4" />
              <Trans>Open AI providers</Trans>
            </Link>
          </>
        }
      />
    )
  if (kind === "quota")
    return (
      <ErrorState
        title={<Trans>Your AI provider is busy</Trans>}
        body={<Trans>Your AI provider turned the request down because of a usage limit. Wait a moment and try again, or set this book up yourself.</Trans>}
        detail={detail}
        actions={
          <>
            {manual}
            {retry}
          </>
        }
      />
    )
  if (kind === "offline")
    return (
      <ErrorState
        title={<Trans>You&apos;re offline</Trans>}
        body={<Trans>Studio can&apos;t reach your AI provider. We&apos;ll try again as soon as you&apos;re back online.</Trans>}
        status={
          <span className="inline-flex items-center gap-2 rounded-full bg-muted px-3 py-1.5 text-[12.5px] font-medium text-muted-foreground">
            <WifiOff className="size-3.5" />
            <Trans>Waiting for a connection</Trans>
            <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" />
          </span>
        }
        detail={detail}
        actions={
          <>
            {manual}
            {retry}
          </>
        }
      />
    )
  return (
    <ErrorState
      title={<Trans>We couldn&apos;t read this book</Trans>}
      body={<Trans>Something went wrong while the AI was looking at your book. Try again, or set it up yourself.</Trans>}
      detail={detail}
      actions={
        <>
          {manual}
          {retry}
        </>
      }
    />
  )
}
