import { Link } from "@tanstack/react-router"
import { Trans } from "@lingui/react/macro"
import { ImportProgress, type ImportStep } from "./ImportProgress"

/**
 * Title row with the stepper beside it. The intro line only shows while the
 * user is still choosing an archive; once a book is under review the hero band
 * below says what is being imported, so the header stays a single line.
 */
export function ImportHeader({
  step,
  failedStep,
}: {
  step: ImportStep
  failedStep: ImportStep | null
}) {
  return (
    <header>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <h1 className="min-w-0 text-2xl font-semibold leading-tight tracking-[-0.5px] text-foreground text-balance">
          <Trans>Import a book</Trans>
        </h1>
        <ImportProgress current={step} failedStep={failedStep} />
      </div>
      {step === 1 ? (
        <p className="mt-1.5 text-sm text-muted-foreground text-pretty">
          <Trans>Bring in a project, a book part, or an ADT Web export.</Trans>{" "}
          <Trans>Starting from a PDF?</Trans>{" "}
          <Link
            to="/books/new"
            className="font-medium text-brand-600 underline-offset-2 transition-colors hover:text-brand-700 hover:underline dark:text-brand-400 dark:hover:text-brand-300"
          >
            <Trans>Create a new book</Trans>
          </Link>
        </p>
      ) : null}
    </header>
  )
}
