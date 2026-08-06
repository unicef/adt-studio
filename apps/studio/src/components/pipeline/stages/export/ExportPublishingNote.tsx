import { Link } from "@tanstack/react-router"
import { Trans } from "@lingui/react/macro"
import { ArrowRight, Globe } from "lucide-react"

/**
 * Export used to carry the whole publishing panel. It now carries a sentence and a door.
 *
 * The two are different jobs: this page produces a file you send somewhere, Publishing keeps a
 * live address with an audience attached. Leaving a pointer rather than nothing is what stops an
 * author who learned the old position from concluding the feature was removed.
 */
export function ExportPublishingNote({ bookLabel }: { bookLabel: string }) {
  return (
    <Link
      to="/books/$label/$step"
      params={{ label: bookLabel, step: "publish" }}
      data-testid="export-publishing-note"
      className="group flex shrink-0 flex-wrap items-center gap-3 rounded-xl border border-indigo-200/80 bg-indigo-50/60 px-4 py-3 transition-colors hover:bg-indigo-50"
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-indigo-700 text-white">
        <Globe className="size-4" aria-hidden="true" />
      </span>
      <p className="min-w-0 flex-1 text-sm leading-6 text-foreground">
        <Trans>
          Want to share this book with readers instead? Publishing puts it online behind a
          private link — no download, no install.
        </Trans>
      </p>
      <span className="flex shrink-0 items-center gap-1.5 text-sm font-medium text-indigo-700">
        <Trans>Go to Publishing</Trans>
        <ArrowRight
          className="size-4 transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transition-none"
          aria-hidden="true"
        />
      </span>
    </Link>
  )
}
