import { i18n } from "@lingui/core"
import { msg } from "@lingui/core/macro"
import type { SectioningPreflightResult } from "@adt/types"

export function sectioningErrorMessage(details: SectioningPreflightResult): string {
  const total = details.total
  const pages = details.displayedPages.slice(0, 20).map((page) => page.pageNumber).join(", ")
  return i18n._(msg`Storyboard cannot run in By Page mode: ${total} pages do not contain exactly one valid section. Re-run Sectioning, then try again. Affected pages: ${pages}.`)
}
