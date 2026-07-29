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

/**
 * A `$…$` span holding nothing but a sub/superscript — `$^{1,2}$`, `$^{3}$`,
 * `$^{*}$` — is a footnote or affiliation marker attached to a name, not an
 * expression. Converting it reads "caret one comma two" over an author list.
 * A real superscript has a base to sit on.
 */
const MARKER_ONLY = /(?<!\\)\$\s*[\^_]\s*\{?[\d\s,*†‡§¶a-z]{0,8}\}?\s*\$/gi

function withoutMarkers(text: string): string {
  return text.replace(MARKER_ONLY, " ")
}

export function containsMathNotation(text: string | null | undefined): boolean {
  if (!text) return false
  if (PATH_LIKE.test(text)) return false
  // Markers are stripped before either test — `^{1,2}` satisfies the bare
  // superscript pattern, so an author list would otherwise register as maths.
  const stripped = withoutMarkers(text)
  return LATEX_COMMAND.test(stripped) || MATHS_DOLLAR.test(stripped)
}
