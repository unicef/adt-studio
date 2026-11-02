import type { StepWarning } from "@adt/types"

/**
 * Image Segmentation and Image Cropping are optional refinements: when the
 * model call for a page fails, the page keeps its extracted images unchanged
 * and the step still completes. That outcome used to be a console line only,
 * so the step read "done" while nobody could tell which pages were skipped.
 * The step now completes with a `pages-unchanged` warning naming them, which
 * is persisted with the step (SPEC-0021, §Step warnings).
 */
export interface ImagePassFailure {
  pageId: string
  error: string
}

const MAX_ERROR_CHARS = 120
/** Fewer attempted pages than this cannot tell a provider problem from a page problem. */
const MIN_ATTEMPTED_TO_FAIL_STEP = 3

/** Error text for a thrown value; thrown non-Errors are stringified. */
function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

function shortError(error: string): string {
  const chars = Array.from(error.replace(/\s+/g, " ").trim())
  return chars.length > MAX_ERROR_CHARS ? `${chars.slice(0, MAX_ERROR_CHARS - 1).join("")}…` : chars.join("")
}

/**
 * The warning for an optional image pass, or undefined when every page
 * succeeded. Pages are in id order so reruns produce the same warning.
 */
export function imagePassWarning(failures: ImagePassFailure[]): StepWarning | undefined {
  if (failures.length === 0) return undefined
  const pages = [...failures]
    .sort((a, b) => a.pageId.localeCompare(b.pageId))
    .map((failure) => ({ pageId: failure.pageId, error: shortError(failure.error) }))
  return { kind: "pages-unchanged", pages }
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

/**
 * An optional pass whose every attempted page failed did no work at all:
 * with at least three attempted pages that is a configuration or provider
 * problem, not a page-level one, and the step must fail rather than complete
 * with a warning. One or two pages failing is still only a warning: a single
 * transient error must not block the required Extract stage.
 */
export function everyPageFailed(failures: ImagePassFailure[], attemptedPages: number): boolean {
  return attemptedPages >= MIN_ATTEMPTED_TO_FAIL_STEP && failures.length >= attemptedPages
}
