import { Trans } from "@lingui/react/macro"
import { PublicationsSkeleton } from "@/components/publications/PublicationsSkeleton"

/** What the Sharing screen shows while the connection is being checked.
 *
 *  Shaped like the connected card it usually resolves into — status header, then the hosted
 *  books section — so the answer arriving replaces placeholders in place instead of swapping
 *  a one-line spinner for a full page. */
export function SharingSetupSkeleton() {
  return (
    <div
      data-testid="sharing-setup-skeleton"
      aria-busy="true"
      aria-live="polite"
      className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border bg-card"
    >
      <span className="sr-only">
        <Trans>Checking your sharing setup…</Trans>
      </span>

      <div aria-hidden="true" className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center gap-3 border-b p-4">
          <div className="size-10 shrink-0 animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />
          <div className="flex flex-col gap-2">
            <div className="h-5 w-40 animate-pulse rounded bg-muted motion-reduce:animate-none" />
            <div className="h-3 w-72 max-w-full animate-pulse rounded bg-muted/60 motion-reduce:animate-none" />
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-4 p-4">
          <div className="flex flex-col gap-2">
            <div className="h-4 w-32 animate-pulse rounded bg-muted motion-reduce:animate-none" />
            <div className="h-3 w-80 max-w-full animate-pulse rounded bg-muted/60 motion-reduce:animate-none" />
          </div>
          <PublicationsSkeleton />
        </div>
      </div>
    </div>
  )
}
