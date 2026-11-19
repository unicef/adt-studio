import type { I18n } from "@lingui/core"
import { msg, plural } from "@lingui/core/macro"
import type { StepWarningView } from "@adt/types"

/**
 * Translated wording for step warnings (SPEC-0021, §Step warnings).
 *
 * The warnings arrive as data because the steps run in `@adt/pipeline` and
 * the API, which have no access to these catalogs; the wording belongs here.
 * Page ids and provider error text are data and stay verbatim. Provider text
 * is kept apart as `technical`, shown as a muted line until SPEC-0017's
 * technical-details disclosure lands.
 */
export interface StepWarningText {
  /** One translated sentence, for the stage card and the popover. */
  summary: string
  /** Supporting lines for the popover (page ids, coverage), possibly empty. */
  details: string[]
  /** Provider error text, verbatim and capped at the contract's 120 characters. */
  technical: string[]
}

const MAX_LISTED_PAGES = 5
const MAX_TECHNICAL_CHARS = 120

/** Up to five page ids, then how many more. */
function listPages(pageIds: string[], i18n: I18n): string[] {
  const listed = pageIds.slice(0, MAX_LISTED_PAGES)
  const more = pageIds.length - MAX_LISTED_PAGES
  return more > 0 ? [...listed, i18n._(msg`… and ${more} more`)] : listed
}

const technicalText = (error: string) => Array.from(error).slice(0, MAX_TECHNICAL_CHARS).join("")

export function describeStepWarning(warning: StepWarningView, i18n: I18n): StepWarningText {
  switch (warning.kind) {
    case "pages-skipped":
      return {
        summary: i18n._(msg({
          message: plural(warning.count, {
            one: "# page was skipped after it failed.",
            other: "# pages were skipped after they failed.",
          }),
        })),
        details: listPages(warning.pageIds ?? [], i18n),
        technical: [],
      }
    case "pages-unchanged": {
      return {
        summary: i18n._(msg({
          message: plural(warning.pages.length, {
            one: "# page kept its extracted images unchanged because the model call failed.",
            other: "# pages kept their extracted images unchanged because the model call failed.",
          }),
        })),
        details: listPages(warning.pages.map((page) => page.pageId), i18n),
        technical: [...new Set(warning.pages.map((page) => technicalText(page.error)))],
      }
    }
    case "summary-missing":
      return {
        summary: i18n._(msg`No book summary was created because the model call failed. Later steps run without it.`),
        details: [],
        technical: [technicalText(warning.error)],
      }
    case "source-assessment": {
      const issues = warning.warning + warning.critical
      const partial = warning.incompletePages > 0
        ? i18n._(msg({
          message: plural(warning.incompletePages, {
            one: "Not fully assessed on # page.",
            other: "Not fully assessed on # pages.",
          }),
        }))
        : undefined
      if (issues === 0 && partial) return { summary: partial, details: [], technical: [] }
      return {
        summary: i18n._(msg({
          message: plural(issues, {
            one: "The source PDF assessment found # issue to check.",
            other: "The source PDF assessment found # issues to check.",
          }),
        })),
        details: partial ? [partial] : [],
        technical: [],
      }
    }
    case "unrecognized":
      return {
        summary: i18n._(msg({
          message: plural(warning.count, {
            one: "# warning this version of ADT Studio can't show; open the book in a newer version.",
            other: "# warnings this version of ADT Studio can't show; open the book in a newer version.",
          }),
        })),
        details: [],
        technical: [],
      }
  }
}

/** The popover line for a step last completed by an app that did not record its warnings. */
export function legacyCompletionNote(i18n: I18n): string {
  return i18n._(msg`Completed by an older version of ADT Studio; it may not have recorded every warning.`)
}
