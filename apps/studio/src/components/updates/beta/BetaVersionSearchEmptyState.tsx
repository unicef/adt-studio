import { Trans } from "@lingui/react/macro"
import { SearchX } from "lucide-react"

export function BetaVersionSearchEmptyState() {
  return (
    <div
      data-slot="beta-version-search-empty-state"
      className="flex min-h-72 my-auto flex-col items-center justify-center px-5 py-8 text-center"
    >
      <div
        className="relative mb-6 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95 motion-safe:duration-300"
        aria-hidden="true"
      >
        <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 [mask-image:linear-gradient(to_bottom,black_45%,transparent_80%)]">
          <div className="size-52 rounded-full border border-border/60" />
          <div className="absolute inset-8 rounded-full border border-border/80" />
        </div>
        <div className="relative flex size-20 items-center justify-center rounded-2xl border bg-muted/50 text-muted-foreground shadow-[0_1px_2px_rgb(0_0_0/0.05),0_4px_12px_-4px_rgb(0_0_0/0.1)]">
          <SearchX className="size-8" strokeWidth={1.5} />
        </div>
      </div>

      <div role="status" aria-live="polite">
        <h2 className="text-balance text-lg font-semibold motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:duration-300 motion-safe:delay-100 motion-safe:fill-mode-backwards">
          <Trans>No beta versions found</Trans>
        </h2>
        <p className="mx-auto mt-1.5 max-w-sm text-pretty text-sm leading-6 text-muted-foreground motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:duration-300 motion-safe:delay-150 motion-safe:fill-mode-backwards">
          <Trans>Try another title, version, or description.</Trans>
        </p>
      </div>
    </div>
  )
}
