/**
 * Whether a text-catalog entry carries mathematical notation.
 *
 * Shared so the pipeline's speech conversion and the Studio's filters agree on
 * what counts as maths — two definitions would drift, and an entry the UI
 * offers for review but the converter ignores (or the reverse) is worse than
 * having no filter at all.
 */

/** A backslash command, or a braced sub/superscript. */
const LATEX_COMMAND = /\\[a-zA-Z]+|[_^]\{/

/**
 * A `$…$` span whose contents actually look like maths. A bare `$5 … $10`
 * price pair matches the delimiters but is currency, and converting it would
 * strip the markers and turn "five dollars" into "five".
 */
const MATHS_DOLLAR = /(?<!\\)\$[^$\s][^$]*[\\^_{][^$]*\$/

/**
 * File paths contain backslash runs that collide with command names —
 * `C:\text\notes.txt` and `D:\times\backup` both parse as maths and lose a
 * path segment. Only a drive prefix or a UNC root counts: a bare `\word\word`
 * is the shape of consecutive commands (`\pi\frac`) and must not disqualify
 * real maths.
 */
const PATH_LIKE = /(?:[A-Za-z]:\\)|(?:\\\\[A-Za-z])/

export function containsMathNotation(text: string | null | undefined): boolean {
  if (!text) return false
  if (PATH_LIKE.test(text)) return false
  return LATEX_COMMAND.test(text) || MATHS_DOLLAR.test(text)
}
