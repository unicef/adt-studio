import { parseDocument, DomUtils } from "htmlparser2"

/**
 * Extract a JSON answer key from a custom-activity section's HTML.
 *
 * The runtime grades custom activities through the agent's inline <script>;
 * this JSON record is a *derived view* of the same correctness information so
 * that the EDIT sidebar, text-catalog, translation, and analytics pipelines
 * can see the answers without parsing the script.
 *
 * Conventions the agent should follow when writing custom activities:
 *
 *   - Per-slot inputs (crossword cells, fill-in-the-blank, etc.):
 *       <input data-answer="B" data-cell="r2c2" ... />
 *     The key is data-cell (preferred) or data-activity-item or
 *     data-aria-id, falling back to a sequential cell-N id. The value is the
 *     data-answer string.
 *
 *   - Drop-target sorting (drag-and-drop activities):
 *       <div data-activity-target="bucket-1" data-correct-items="item-1,item-2">...</div>
 *     The key is data-activity-target, the value is the CSV string of correct
 *     items (we keep the CSV form so the runtime script can use the same
 *     attribute it already reads).
 *
 * Returns undefined if the HTML contains no extractable answers — so callers
 * can fall back to the agent-supplied activityAnswers (or omit the field
 * entirely).
 */
export function extractAnswersFromHtml(
  html: string,
): Record<string, string> | undefined {
  const doc = parseDocument(html)
  const answers: Record<string, string> = {}

  // [data-answer] inputs — per-slot grading
  const answerEls = DomUtils.findAll(
    (el) => el.type === "tag" && el.attribs?.["data-answer"] !== undefined,
    doc.children,
  )
  let cellCounter = 0
  for (const el of answerEls) {
    const value = el.attribs["data-answer"]
    if (value === undefined) continue
    const key =
      el.attribs["data-cell"] ||
      el.attribs["data-activity-item"] ||
      el.attribs["data-aria-id"] ||
      `cell-${++cellCounter}`
    if (answers[key] !== undefined) continue
    answers[key] = value
  }

  // [data-correct-items] targets — sorting / drag-and-drop grading
  const targetEls = DomUtils.findAll(
    (el) =>
      el.type === "tag" && el.attribs?.["data-correct-items"] !== undefined,
    doc.children,
  )
  for (const el of targetEls) {
    const key = el.attribs["data-activity-target"] ?? el.attribs["data-id"]
    const value = el.attribs["data-correct-items"]
    if (!key || value === undefined) continue
    if (answers[key] !== undefined) continue
    answers[key] = value
  }

  return Object.keys(answers).length > 0 ? answers : undefined
}
