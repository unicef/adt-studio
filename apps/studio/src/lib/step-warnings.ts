import type { I18n } from "@lingui/core"
import { msg, plural } from "@lingui/core/macro"
import type { StepWarning } from "@adt/types"

/**
 * Translated wording for step warnings (SPEC-0021, §Step warnings).
 *
 * The warnings arrive as data because the steps run in `@adt/pipeline` and
 * the API, which have no access to these catalogs; the wording belongs here.
 * Page ids and provider error text are data and stay verbatim, as in
 * `stepError`.
 */
export interface StepWarningText {
  /** One translated sentence, for the stage card and the popover. */
  summary: string
  /** Supporting lines for the popover (pages and errors), possibly empty. */
  details: string[]
}

const MAX_LISTED_PAGES = 5

export function describeStepWarning(warning: StepWarning, i18n: I18n): StepWarningText {
  switch (warning.kind) {
    case "pages-skipped":
      return {
        summary: i18n._(msg({
          message: plural(warning.count, {
            one: "# page was skipped after it failed.",
            other: "# pages were skipped after they failed.",
          }),
        })),
        details: [],
      }
    case "pages-unchanged": {
      const listed = warning.pages.slice(0, MAX_LISTED_PAGES).map((page) => `${page.pageId}: ${page.error}`)
      const more = warning.pages.length - MAX_LISTED_PAGES
      return {
        summary: i18n._(msg({
          message: plural(warning.pages.length, {
            one: "# page kept its extracted images unchanged because the model call failed.",
            other: "# pages kept their extracted images unchanged because the model call failed.",
          }),
        })),
        details: more > 0 ? [...listed, i18n._(msg`… and ${more} more`)] : listed,
      }
    }
    case "summary-missing":
      return {
        summary: i18n._(msg`No book summary was created because the model call failed. Later steps run without it.`),
        details: [warning.error],
      }
    case "source-assessment": {
      const issues = warning.warning + warning.critical
      return {
        summary: i18n._(msg({
          message: plural(issues, {
            one: "The source PDF assessment found # issue to check.",
            other: "The source PDF assessment found # issues to check.",
          }),
        })),
        details: [],
      }
    }
  }
}
