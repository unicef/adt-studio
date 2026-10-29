import type { StepWarning } from "@adt/types"

/**
 * English rendering of a step's warnings (SPEC-0021, §Step warnings) for the
 * CLI, the server log and any reader of the plain `message`. Studio does not
 * use it: it renders the typed warnings through its own Lingui catalogs.
 */
const COMPLETED_PREFIX = "Completed — "
const MAX_LISTED_PAGES = 5

function clause(warning: StepWarning): string {
  switch (warning.kind) {
    case "pages-skipped":
      return `${warning.count} page(s) skipped`
    case "pages-unchanged": {
      const listed = warning.pages.slice(0, MAX_LISTED_PAGES).map((page) => `${page.pageId} (${page.error})`)
      const more = warning.pages.length > MAX_LISTED_PAGES ? `, … and ${warning.pages.length - MAX_LISTED_PAGES} more` : ""
      return `${warning.pages.length} page(s) kept their extracted images unchanged after a failure: ${listed.join(", ")}${more}`
    }
    case "summary-missing":
      return `no book summary after a failure: ${warning.error}`
    case "source-assessment":
      return `source assessment: ${warning.warning} warning(s), ${warning.critical} critical`
  }
}

/** One line for all of a step's warnings, or undefined when it has none. */
export function formatStepWarnings(warnings: StepWarning[] | undefined): string | undefined {
  if (!warnings || warnings.length === 0) return undefined
  return `${COMPLETED_PREFIX}${warnings.map(clause).join("; ")}`
}
