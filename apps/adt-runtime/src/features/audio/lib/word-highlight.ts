/**
 * DOM mutation utilities for read-aloud highlighting.
 *
 * Two modes, decided per-element by the caller:
 *
 *   - **Word**: split the element's text into `<span data-word-index="N">`
 *     wrappers and toggle a yellow background on the word that matches the
 *     current playback time. Original innerHTML is stashed on the element
 *     so unwrap restores byte-for-byte what was there.
 *
 *   - **Block**: just toggle `tts-active-block` on the element so the whole
 *     line gets a soft yellow background. Used for `<img>`, form fields,
 *     and when the user has the word-highlight toggle off.
 *
 * The CSS rule that turns `.bg-yellow-300` on `[data-word-index]` into the
 * fixed black-on-yellow pair (regardless of surrounding text color) lives
 * in `apps/adt-runtime/src/styles/globals.css` (mirrored to assets/adt/
 * tailwind_css.css), which is what makes word highlighting readable on
 * pages with custom typography.
 */
import {
  buildWordRenderPlan,
  createApproximateWordTimestamps,
  type WordTimestamp,
} from "@/features/audio/lib/tokenizer"
import {
  fontFamilyClassesFromClassList,
  parseSegments,
  styleToInline,
  type Segment,
} from "@/shared/lib/fl-segments"

const ORIGINAL_HTML_ATTR = "data-tts-original-html"
const WORD_HIGHLIGHT_CLASS = "bg-yellow-300"
const BLOCK_HIGHLIGHT_CLASS = "tts-active-block"

/**
 * Fixed-layout word wrap: tokenise across the concatenated `data-segments`
 * text, then for each word emit a `<span data-word-index="N">` containing
 * the per-segment styled `<span style="…">` slices that overlap the word's
 * character range. Preserves the styled-run structure (coloured letters,
 * mixed fonts, contrast strokes) the renderer baked in.
 */
function wrapWordsFromSegments(element: HTMLElement, segments: Segment[]): boolean {
  const plan = buildWordRenderPlan(segments.map((s) => s.text).join(""))
  if (!plan.some((s) => s.type === "word")) return false

  const doc = element.ownerDocument
  const spanClasses = fontFamilyClassesFromClassList(element.classList)
  const segOffsets: number[] = []
  let cursor = 0
  for (const s of segments) {
    segOffsets.push(cursor)
    cursor += s.text.length
  }

  const buildPieces = (start: number, end: number): HTMLSpanElement[] => {
    const out: HTMLSpanElement[] = []
    for (let i = 0; i < segments.length; i++) {
      const segStart = segOffsets[i]
      const segEnd = segStart + segments[i].text.length
      if (segEnd <= start) continue
      if (segStart >= end) break
      const slice = segments[i].text.slice(
        Math.max(start, segStart) - segStart,
        Math.min(end, segEnd) - segStart,
      )
      if (!slice.length) continue
      const span = doc.createElement("span")
      const styleStr = styleToInline(segments[i].style)
      if (spanClasses.length > 0) span.className = spanClasses.join(" ")
      if (styleStr) span.setAttribute("style", styleStr)
      span.appendChild(doc.createTextNode(slice))
      out.push(span)
    }
    return out
  }

  const fragment = doc.createDocumentFragment()
  let charCursor = 0
  for (const seg of plan) {
    if (seg.type === "separator") {
      if (seg.text.length > 0) fragment.appendChild(doc.createTextNode(seg.text))
      charCursor += seg.text.length
      continue
    }
    const start = charCursor
    const end = start + seg.text.length
    const wrap = doc.createElement("span")
    wrap.setAttribute("data-word-index", String(seg.wordIndex))
    for (const piece of buildPieces(start, end)) wrap.appendChild(piece)
    fragment.appendChild(wrap)
    charCursor = end
  }
  element.replaceChildren(fragment)
  return true
}

/**
 * Wrap each whitespace-separated word inside `element` with a span carrying
 * `data-word-index="N"`. Idempotent — calling twice on the same element
 * is a no-op. When the element carries `data-segments` (fixed-layout
 * paragraphs with per-run styling), the styled-span structure is preserved
 * inside each word wrap.
 */
export function wrapWordsForElement(element: HTMLElement, text: string): void {
  if (element.hasAttribute(ORIGINAL_HTML_ATTR)) return
  element.setAttribute(ORIGINAL_HTML_ATTR, element.innerHTML)

  const segments = parseSegments(element.getAttribute("data-segments"))
  if (segments && segments.length > 0) {
    if (wrapWordsFromSegments(element, segments)) return
    element.removeAttribute(ORIGINAL_HTML_ATTR)
    return
  }

  const plan = buildWordRenderPlan(text)
  // No matchable words (pure punctuation, empty string) — leave the element
  // alone, the block-highlight code path will pick it up if needed.
  if (!plan.some((s) => s.type === "word")) {
    element.removeAttribute(ORIGINAL_HTML_ATTR)
    return
  }

  const fragment = document.createDocumentFragment()
  for (const segment of plan) {
    if (segment.type === "word") {
      const span = document.createElement("span")
      span.setAttribute("data-word-index", String(segment.wordIndex))
      span.textContent = segment.text
      fragment.appendChild(span)
    } else {
      fragment.appendChild(document.createTextNode(segment.text))
    }
  }
  element.replaceChildren(fragment)
}

export function unwrapWordsForElement(element: HTMLElement): void {
  const original = element.getAttribute(ORIGINAL_HTML_ATTR)
  if (original === null) return
  element.innerHTML = original
  element.removeAttribute(ORIGINAL_HTML_ATTR)
}

export function setWordHighlight(element: HTMLElement, wordIndex: number): void {
  // Clear the previously-marked word inside this element only — global
  // queries would also catch other in-flight elements during rapid skip.
  const prev = element.querySelector<HTMLElement>(
    `[data-word-index].${WORD_HIGHLIGHT_CLASS}`,
  )
  if (prev) prev.classList.remove(WORD_HIGHLIGHT_CLASS)
  if (wordIndex < 0) return
  const target = element.querySelector<HTMLElement>(
    `[data-word-index="${wordIndex}"]`,
  )
  if (target) target.classList.add(WORD_HIGHLIGHT_CLASS)
}

export function clearWordHighlight(element: HTMLElement): void {
  element
    .querySelectorAll<HTMLElement>(`[data-word-index].${WORD_HIGHLIGHT_CLASS}`)
    .forEach((el) => el.classList.remove(WORD_HIGHLIGHT_CLASS))
}

export function setBlockHighlight(element: HTMLElement): void {
  element.classList.add(BLOCK_HIGHLIGHT_CLASS)
}

export function clearBlockHighlight(element: HTMLElement): void {
  element.classList.remove(BLOCK_HIGHLIGHT_CLASS)
}

/**
 * Find the index of the word whose `[start, end)` window contains
 * `currentTime`. Returns the last index if past the end of the array,
 * or -1 if before the first word.
 */
export function findWordIndexAtTime(
  timestamps: WordTimestamp[],
  currentTime: number,
): number {
  if (timestamps.length === 0) return -1
  for (let i = 0; i < timestamps.length; i++) {
    const t = timestamps[i]
    if (currentTime >= t.start && currentTime < t.end) return i
  }
  if (currentTime >= timestamps[timestamps.length - 1].end) {
    return timestamps.length - 1
  }
  return -1
}

/**
 * Returns the timestamps to use for an element. Prefers precise per-word
 * timings from the API; falls back to weight-based estimates derived from
 * the audio's known duration. The estimate isn't perfect but lets word
 * highlighting work for books that haven't generated tts-timestamps.
 */
export function resolveWordTimestamps(
  textId: string,
  text: string,
  audioDuration: number,
  precise: WordTimestamp[] | undefined,
): WordTimestamp[] {
  if (precise && precise.length > 0) return precise
  if (!Number.isFinite(audioDuration) || audioDuration <= 0) {
    // Audio not yet ready; estimate using text alone (still better than nothing).
    return createApproximateWordTimestamps(text, NaN)
  }
  return createApproximateWordTimestamps(text, audioDuration)
}

/**
 * Element kinds that can't host inline word spans — fall back to block
 * highlighting for them regardless of the user's word-highlight toggle.
 */
export function elementSupportsWordHighlight(element: HTMLElement): boolean {
  const tag = element.tagName.toLowerCase()
  return tag !== "img" && tag !== "input" && tag !== "textarea" && tag !== "select"
}
