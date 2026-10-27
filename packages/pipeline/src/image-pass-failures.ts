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

/** Error text for a thrown value; thrown non-Errors are stringified. */
export function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

function shortError(error: string): string {
  const chars = Array.from(error.replace(/\s+/g, " ").trim())
  return chars.length > MAX_ERROR_CHARS ? `${chars.slice(0, MAX_ERROR_CHARS - 1).join("")}…` : chars.join("")
}

/**
 * Completion message for an optional image pass, or undefined when every page
 * succeeded. Pages are listed in id order so reruns produce the same message.
 */
export function imagePassCompletionMessage(failures: ImagePassFailure[]): string | undefined {
  if (failures.length === 0) return undefined
  const sorted = [...failures].sort((a, b) => a.pageId.localeCompare(b.pageId))
  const listed = sorted.slice(0, MAX_LISTED_PAGES).map((failure) => `${failure.pageId} (${shortError(failure.error)})`)
  const more = failures.length > MAX_LISTED_PAGES ? `, … and ${failures.length - MAX_LISTED_PAGES} more` : ""
  return `Completed — ${failures.length} page(s) kept their extracted images unchanged after a failure: ${listed.join(", ")}${more}`
}

/**
 * Run the optional model call for one page. A failure is recorded against the
 * page and `undefined` is returned so the caller skips applying results; the
 * page keeps its extracted images. Cancellation and anything the caller does
 * not classify as a model failure propagate. Errors thrown while applying a
 * successful result are not covered here on purpose: they can leave a page
 * partially updated, so they must surface as a step error.
 */
export async function recordOptionalModelFailure<T>(
  failures: ImagePassFailure[],
  pageId: string,
  call: () => Promise<T>,
  log: (message: string) => void,
  rethrow?: (err: unknown) => boolean,
): Promise<T | undefined> {
  try {
    return await call()
  } catch (err) {
    if (rethrow?.(err)) throw err
    const error = errorText(err)
    failures.push({ pageId, error })
    log(error)
    return undefined
  }
}
