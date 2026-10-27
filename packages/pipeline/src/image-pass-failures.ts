/**
 * Image Segmentation and Image Cropping are optional refinements: when the
 * model call for a page fails, the page keeps its extracted images unchanged
 * and the step still completes. That outcome used to be a console line only,
 * so the step read "done" while nobody could tell which pages were skipped.
 * The completion message now names them, and it is persisted with the step.
 */
export interface ImagePassFailure {
  pageId: string
  error: string
}

const MAX_LISTED_PAGES = 5
const MAX_ERROR_CHARS = 120

function shortError(error: string): string {
  const oneLine = error.replace(/\s+/g, " ").trim()
  return oneLine.length > MAX_ERROR_CHARS ? `${oneLine.slice(0, MAX_ERROR_CHARS - 1)}…` : oneLine
}

/** Completion message for an optional image pass, or undefined when every page succeeded. */
export function imagePassCompletionMessage(failures: ImagePassFailure[]): string | undefined {
  if (failures.length === 0) return undefined
  const listed = failures.slice(0, MAX_LISTED_PAGES).map((failure) => `${failure.pageId} (${shortError(failure.error)})`)
  const more = failures.length > MAX_LISTED_PAGES ? `, … and ${failures.length - MAX_LISTED_PAGES} more` : ""
  return `Completed — ${failures.length} page(s) kept their extracted images unchanged after a failure: ${listed.join(", ")}${more}`
}
