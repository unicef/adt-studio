import { Link } from "@tanstack/react-router"
import { Trans } from "@lingui/react/macro"
import { ImportProgress, type ImportStep } from "./ImportProgress"

export function ImportHeader({
  step,
  failedStep,
}: {
  step: ImportStep
  failedStep: ImportStep | null
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.6px] text-foreground text-balance">
          <Trans>Import a book</Trans>
        </h1>
        <p className="mt-1 text-sm text-muted-foreground text-pretty">
          <Trans>Bring in a project, a book part, or an ADT Web export.</Trans>{" "}
          <Trans>Starting from a PDF?</Trans>{" "}
          <Link
            to="/books/new"
            className="font-medium text-brand-600 underline underline-offset-2 transition-colors hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300"
          >
            <Trans>Create a new book</Trans>
          </Link>
        </p>
      </div>
      <ImportProgress current={step} failedStep={failedStep} />
    </header>
  )
}
