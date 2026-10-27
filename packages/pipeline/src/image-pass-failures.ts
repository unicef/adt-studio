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

const COMPLETED_PREFIX = "Completed — "
const MAX_LISTED_PAGES = 5
const MAX_ERROR_CHARS = 120

/** Error text for a thrown value; thrown non-Errors are stringified. */
function errorText(err: unknown): string {
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
  return `${COMPLETED_PREFIX}${failures.length} page(s) kept their extracted images unchanged after a failure: ${listed.join(", ")}${more}`
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

/** Strip the "Completed — " prefix so several notes can share one. */
export function noteClause(note: string): string {
  return note.startsWith(COMPLETED_PREFIX) ? note.slice(COMPLETED_PREFIX.length) : note
}

/** Join completion notes under a single "Completed — " prefix. */
export function joinCompletionNotes(notes: Array<string | undefined>): string | undefined {
  const clauses = notes.filter((note): note is string => !!note).map(noteClause)
  return clauses.length ? `${COMPLETED_PREFIX}${clauses.join("; ")}` : undefined
}

/**
 * An optional pass whose every attempted page failed did no work at all:
 * that is a configuration or provider problem, not a page-level one, and the
 * step must fail rather than complete with a warning nobody reads.
 */
export function everyPageFailed(failures: ImagePassFailure[], attemptedPages: number): boolean {
  return attemptedPages > 0 && failures.length >= attemptedPages
}
