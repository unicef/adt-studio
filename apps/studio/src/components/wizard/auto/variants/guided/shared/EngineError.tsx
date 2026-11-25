import { useEffect } from "react"
import { Link } from "@tanstack/react-router"
import { Trans } from "@lingui/react/macro"
import { Loader2, Plug, RotateCcw, WifiOff } from "lucide-react"
import type { SetupFailure } from "../../../recommendation/client"
import { ErrorDetails } from "../../../errors/ErrorState"
import { Chip } from "./bubbles"

/**
 * Why the assistant couldn't read the book, said as its own message, with what to do next. The
 * same four kinds as the prototype's SetupError: auth, quota, offline (retries by itself when the
 * connection returns) and anything else. "Set it up myself" keeps the PDF.
 */
export function EngineError({ failure, onRetry, onManual, current }: { failure: SetupFailure; onRetry: () => void; onManual: () => void; current: boolean }) {
  useEffect(() => {
    if (!current || failure.kind !== "offline") return
    window.addEventListener("online", onRetry)
    return () => window.removeEventListener("online", onRetry)
  }, [current, failure.kind, onRetry])

  const title =
    failure.kind === "auth" ? (
      <Trans>Your AI provider didn&apos;t accept the API key.</Trans>
    ) : failure.kind === "quota" ? (
      <Trans>Your AI provider turned me down because of a usage limit.</Trans>
    ) : failure.kind === "offline" ? (
      <Trans>I can&apos;t reach your AI provider. You seem to be offline.</Trans>
    ) : (
      <Trans>Something went wrong while I was looking at your book.</Trans>
    )
  const body =
    failure.kind === "auth" ? (
      <Trans>Update it in Settings and try again, or set this book up yourself. Your PDF stays here.</Trans>
    ) : failure.kind === "quota" ? (
      <Trans>Wait a moment and try again, or set this book up yourself. Your PDF stays here.</Trans>
    ) : failure.kind === "offline" ? (
      <Trans>I&apos;ll try again as soon as you&apos;re back online.</Trans>
    ) : (
      <Trans>Try again, or set it up yourself. Your PDF stays here.</Trans>
    )

  return (
    <div className="flex flex-col gap-2">
      <p>
        <strong className="font-semibold">{title}</strong> <span className="text-muted-foreground">{body}</span>
      </p>
      {current && failure.kind === "offline" && (
        <span className="inline-flex w-fit items-center gap-2 rounded-full bg-muted px-3 py-1.5 text-[12.5px] font-medium text-muted-foreground">
          <WifiOff className="size-3.5" />
          <Trans>Waiting for a connection</Trans>
          <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" />
        </span>
      )}
      {current && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {failure.kind === "auth" ? (
            <Link to="/settings/providers" className="inline-flex h-11 items-center gap-1.5 rounded-full bg-brand-600 px-4 text-[14.5px] font-medium text-primary-foreground transition-[transform,background-color] duration-150 hover:bg-brand-600/90 active:scale-[0.97]">
              <Plug className="size-4" />
              <Trans>Open AI providers</Trans>
            </Link>
          ) : (
            <Chip primary onClick={onRetry} icon={<RotateCcw className="size-4" />}>
              <Trans>Try again</Trans>
            </Chip>
          )}
          <Chip onClick={onManual}>
            <Trans>Set it up myself</Trans>
          </Chip>
        </div>
      )}
      <ErrorDetails detail={failure.detail} className="items-start [&>button]:-ml-2" />
    </div>
  )
}
