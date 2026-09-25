import {
  PageSectioningOutput,
  type SectioningMode,
  type SectioningSourcePage,
  type SectioningPreflightFailure,
  type SectioningPreflightResult,
} from "@adt/types"

/** Validate persisted values, without converting, pruning or renumbering them.
 * The caller supplies the active extracted pages (including a part's window).
 * A missing map entry is missing; a tombstone or unreadable value is invalid.
 * Dynamic mode deliberately retains its existing semantics. */
export function preflightSectioning(
  mode: SectioningMode,
  pages: readonly SectioningSourcePage[],
  latest: ReadonlyMap<string, unknown>,
): SectioningPreflightResult {
  const failures: SectioningPreflightFailure[] = []
  if (mode === "page") {
    for (const { pageId, pageNumber } of pages) {
      let reason: SectioningPreflightFailure["reason"] | undefined
      if (!latest.has(pageId)) {
        reason = "missing"
      } else {
        const parsed = PageSectioningOutput.safeParse(latest.get(pageId))
        if (!parsed.success) reason = "invalid-data"
        else if (parsed.data.sections.length === 0) reason = "empty"
        else if (parsed.data.sections.length > 1) reason = "multiple"
      }
      if (reason) failures.push({ pageId, pageNumber, reason })
    }
  }
  return { total: failures.length, failures, displayedPages: failures.slice(0, 20) }
}

export class SectioningPreflightError extends Error {
  readonly code = "SECTIONING_PREFLIGHT_FAILED"
  constructor(readonly details: SectioningPreflightResult) {
    const pages = details.displayedPages.map((p) => `${p.pageNumber} (${p.pageId})`).join(", ")
    super(`Storyboard cannot run in By Page mode: ${details.total} page(s) do not contain exactly one valid section. Re-run Sectioning, then try Storyboard again. Affected pages: ${pages}${details.total > 20 ? ", …" : ""}.`)
    this.name = "SectioningPreflightError"
  }
}
