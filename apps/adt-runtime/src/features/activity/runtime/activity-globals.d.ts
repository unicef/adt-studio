/**
 * Globals the packaged page injects for activity grading.
 *
 * Emitted by `packages/pipeline/src/packaging/web.ts:renderPageHtml` from the
 * section's `activityAnswers`. Declared once here because every activity
 * initializer reads the same window property — seven separate `declare global`
 * blocks previously drifted apart (one said `Record<string, string>`, the rest
 * `Record<string, unknown>`), which is a type error since TypeScript requires
 * repeated declarations of a property to agree.
 *
 * The value type is deliberately `unknown`: `activityAnswers` is
 * `Record<string, string | boolean | number>`, and each activity means
 * something different by it —
 *   - fill-in-the-blank / fill-in-a-table: the correct text (pipe-separated
 *     for alternatives)
 *   - multiple-choice / quiz / multi-select: `true` when the item is correct
 *     (multi-select: when it SHOULD be selected)
 *   - true/false: the correct value, `"true"` or `"false"`
 *   - underline-text: `true` when the word should be underlined
 *   - matching: the slot id (`dropzone-N`) the item belongs in
 *   - sorting: the category id (`data-activity-category`) the item belongs in
 * so each reader narrows/coerces it at the point of use.
 */
interface Window {
  correctAnswers?: Record<string, unknown>
  /**
   * Legacy: pairs of interchangeable items (e.g. "the same two answers in
   * either order"). The pipeline doesn't currently emit this, but the legacy
   * runtime supported it — kept so older books still work.
   */
  interchangeablePairs?: Record<string, string[]>
}
