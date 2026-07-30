/**
 * Derive human-readable labels for a custom activity's slots and items from its
 * rendered HTML, so the EDIT sidebar can show "Top left space → Tile D" instead
 * of the opaque "slot-1 → item-1" that lives in the answer key.
 *
 * The answer key (`activityAnswers`) stores raw ids:
 *   - drop targets:  data-activity-target → CSV of correct data-activity-item ids
 *   - per-slot inputs (crossword/fill): a slot id → the literal expected answer
 *
 * The matching visible text lives in the section HTML (slot labels, tile text /
 * image alt). This module pairs the two so answers become auditable.
 */

export interface ActivityItem {
  /** data-activity-item id, e.g. "item-1" */
  id: string
  /** Visible label, e.g. "Tile D" (falls back to image alt, then the id). */
  label: string
}

export interface ActivityLabelInfo {
  /** drop-target id → visible slot label, e.g. { "slot-1": "Top left space" } */
  targetLabels: Record<string, string>
  /** item id → visible label, e.g. { "item-1": "Tile D" } */
  itemLabels: Record<string, string>
  /** All draggable items in document order, for answer dropdowns. */
  items: ActivityItem[]
  /**
   * The grader's source-of-truth answers, read straight from the HTML
   * attributes (`data-correct-items` on drop targets, `data-answer` on per-slot
   * inputs). This is what the inline grading script actually checks — it can
   * drift from the derived `activityAnswers` map, so the editor displays THIS.
   */
  htmlAnswers: Record<string, string>
}

const EMPTY: ActivityLabelInfo = {
  targetLabels: {},
  itemLabels: {},
  items: [],
  htmlAnswers: {},
}

function cleanText(el: Element): string {
  const clone = el.cloneNode(true) as Element
  // Strip runtime-only bits that aren't part of an element's label — placed
  // tiles, feedback marks, and the live status region.
  clone
    .querySelectorAll(
      ".item-feedback, .slot-feedback, .activity-feedback-icon, .validation-mark, .drop-zone, [data-activity-status]",
    )
    .forEach((n) => n.remove())
  return (clone.textContent ?? "").replace(/\s+/g, " ").trim()
}

function targetLabel(el: Element, doc: Document): string {
  // Prefer the element the slot points at via aria-labelledby (the generator
  // wires this up for screen readers, so it's the most reliable slot name).
  const labelledBy = el.getAttribute("aria-labelledby")
  if (labelledBy) {
    const text = labelledBy
      .split(/\s+/)
      .map((id) => doc.getElementById(id)?.textContent ?? "")
      .join(" ")
      .replace(/\s+/g, " ")
      .trim()
    if (text) return text
  }
  // Otherwise a label-ish child, then the target's own (non-tile) text.
  const candidate = el.querySelector(".font-semibold, label, [class*='label']")
  const fromChild = candidate ? cleanText(candidate) : ""
  return fromChild || cleanText(el)
}

function itemLabel(el: Element): string {
  const text = cleanText(el)
  if (text) return text
  // Image-only tiles carry their name in the alt text.
  const img = el.querySelector("img")
  return img?.getAttribute("alt")?.trim() ?? ""
}

/**
 * Parse a custom activity's rendered HTML into slot/item label maps. Returns
 * empty maps when there's no HTML or no DOMParser (non-browser env / bad HTML).
 */
export function parseActivityLabels(html: string): ActivityLabelInfo {
  if (!html || typeof DOMParser === "undefined") return EMPTY

  let doc: Document
  try {
    doc = new DOMParser().parseFromString(html, "text/html")
  } catch {
    return EMPTY
  }

  const targetLabels: Record<string, string> = {}
  doc.querySelectorAll("[data-activity-target]").forEach((el) => {
    const id = el.getAttribute("data-activity-target")
    if (!id || id in targetLabels) return
    targetLabels[id] = targetLabel(el, doc)
  })

  const itemLabels: Record<string, string> = {}
  const items: ActivityItem[] = []
  doc.querySelectorAll("[data-activity-item]").forEach((el) => {
    const id = el.getAttribute("data-activity-item")
    if (!id || id in itemLabels) return
    const label = itemLabel(el)
    itemLabels[id] = label
    items.push({ id, label })
  })

  // Mirror packages/agents/src/tools/extract-custom-answers.ts: the grader's
  // answers live on the HTML. Drop targets carry data-correct-items; per-slot
  // inputs (crossword/fill) carry data-answer.
  const htmlAnswers: Record<string, string> = {}
  doc.querySelectorAll("[data-correct-items]").forEach((el) => {
    const key =
      el.getAttribute("data-activity-target") ?? el.getAttribute("data-id")
    const value = el.getAttribute("data-correct-items")
    if (!key || value == null || key in htmlAnswers) return
    htmlAnswers[key] = value
  })
  doc.querySelectorAll("[data-answer]").forEach((el) => {
    const key =
      el.getAttribute("data-cell") ??
      el.getAttribute("data-activity-item") ??
      el.getAttribute("data-aria-id")
    const value = el.getAttribute("data-answer")
    if (!key || value == null || key in htmlAnswers) return
    htmlAnswers[key] = value
  })

  return { targetLabels, itemLabels, items, htmlAnswers }
}

/** Split a `data-correct-items` CSV value into trimmed, non-empty item ids. */
export function parseItemTokens(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
}

/** Escape a string for use inside a quoted attribute-value selector. */
function escAttr(s: string): string {
  return s.replace(/["\\]/g, "\\$&")
}

/**
 * Write an edited answer back into a custom activity's HTML — the source of
 * truth its inline grading script reads. `key` is the answer-key id and `value`
 * is the new answer (a CSV of item ids for drop targets, or a literal string
 * for per-slot inputs). Returns the original HTML unchanged if no matching
 * element is found (or no DOM is available).
 */
export function writeCustomAnswerToHtml(
  html: string,
  key: string,
  value: string,
): string {
  if (!html || typeof DOMParser === "undefined") return html

  let doc: Document
  try {
    doc = new DOMParser().parseFromString(html, "text/html")
  } catch {
    return html
  }

  const k = escAttr(key)

  // Drag-and-drop drop target → data-correct-items (CSV of item ids).
  const target =
    doc.querySelector(`[data-activity-target="${k}"]`) ??
    doc.querySelector(`[data-id="${k}"][data-correct-items]`)
  if (target) {
    target.setAttribute("data-correct-items", value)
    return doc.body.innerHTML
  }

  // Per-slot input (crossword cell, fill-in) → data-answer (literal answer).
  const input = doc.querySelector(
    `[data-cell="${k}"][data-answer], [data-activity-item="${k}"][data-answer], [data-aria-id="${k}"][data-answer]`,
  )
  if (input) {
    input.setAttribute("data-answer", value)
    return doc.body.innerHTML
  }

  return html
}
