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
  extractHighlightableWordSpans,
  type WordTimestamp,
} from "@/features/audio/lib/tokenizer"
import { parseSegments, styleToInline, type Segment } from "@/shared/lib/fl-segments"

const ORIGINAL_HTML_ATTR = "data-tts-original-html"
const WORD_INDICES_ATTR = "data-word-indices"
const WORD_HIGHLIGHT_CLASS = "bg-yellow-300"
const BLOCK_HIGHLIGHT_CLASS = "tts-active-block"
const FIT_ATTR = "data-adt-fit"

export interface DisplayCharacterRange {
  wordIndex: number
  start: number
  end: number
}

/** One provider-text word linked to the visible character ranges it represents. */
export interface SpeechDisplayWordAlignment {
  speechWordIndex: number
  speechText: string
  speechStart: number
  speechEnd: number
  displayWordIndices: number[]
  displayRanges: DisplayCharacterRange[]
}

export interface DisplayWordTimestamp extends WordTimestamp {
  displayWordIndices: number[]
}

function exactWordAnchors(
  source: string[],
  target: string[],
): Array<[number, number]> {
  // Normalized speech usually differs in only a small region. Bound the LCS
  // matrix for pathological paragraphs and use ordered greedy anchors beyond
  // that point; the unmatched regions still receive proportional mappings.
  if (source.length * target.length > 250_000) {
    const anchors: Array<[number, number]> = []
    let sourceCursor = 0
    for (let targetIndex = 0; targetIndex < target.length; targetIndex++) {
      const sourceIndex = source.indexOf(target[targetIndex], sourceCursor)
      if (sourceIndex < 0) continue
      anchors.push([sourceIndex, targetIndex])
      sourceCursor = sourceIndex + 1
    }
    return anchors
  }

  const lengths = Array.from(
    { length: source.length + 1 },
    () => new Uint32Array(target.length + 1),
  )
  for (let sourceIndex = 1; sourceIndex <= source.length; sourceIndex++) {
    for (let targetIndex = 1; targetIndex <= target.length; targetIndex++) {
      lengths[sourceIndex][targetIndex] =
        source[sourceIndex - 1] === target[targetIndex - 1]
          ? lengths[sourceIndex - 1][targetIndex - 1] + 1
          : Math.max(
              lengths[sourceIndex - 1][targetIndex],
              lengths[sourceIndex][targetIndex - 1],
            )
    }
  }

  const anchors: Array<[number, number]> = []
  let sourceIndex = source.length
  let targetIndex = target.length
  while (sourceIndex > 0 && targetIndex > 0) {
    if (source[sourceIndex - 1] === target[targetIndex - 1]) {
      anchors.push([sourceIndex - 1, targetIndex - 1])
      sourceIndex--
      targetIndex--
    } else if (
      lengths[sourceIndex - 1][targetIndex] >=
      lengths[sourceIndex][targetIndex - 1]
    ) {
      sourceIndex--
    } else {
      targetIndex--
    }
  }
  return anchors.reverse()
}

/**
 * Map every target word to one or more source words. Exact words act as stable
 * anchors; changed runs between them are divided proportionally. This handles
 * one-to-many normalization (`25` -> `twenty five`) and many-to-one wording
 * (`do not` -> `don't`) without pretending that character edits are equal.
 */
function mapTargetWordsToSourceWords(
  source: string[],
  target: string[],
): number[][] | null {
  if (source.length === 0 || target.length === 0) return null

  const mappings = Array.from({ length: target.length }, () => [] as number[])
  const anchors = exactWordAnchors(source, target)
  let sourceCursor = 0
  let targetCursor = 0

  const mapChangedRegion = (sourceEnd: number, targetEnd: number) => {
    const sourceCount = sourceEnd - sourceCursor
    const targetCount = targetEnd - targetCursor
    if (targetCount === 0) return

    if (sourceCount === 0) {
      const neighbor =
        sourceCursor > 0
          ? sourceCursor - 1
          : sourceCursor < source.length
            ? sourceCursor
            : -1
      if (neighbor >= 0) {
        for (let index = targetCursor; index < targetEnd; index++) {
          mappings[index] = [neighbor]
        }
      }
      return
    }

    for (let offset = 0; offset < targetCount; offset++) {
      const first = Math.floor((offset * sourceCount) / targetCount)
      const lastExclusive = Math.max(
        first + 1,
        Math.ceil(((offset + 1) * sourceCount) / targetCount),
      )
      mappings[targetCursor + offset] = Array.from(
        { length: Math.min(sourceCount, lastExclusive) - first },
        (_, index) => sourceCursor + first + index,
      )
    }
  }

  for (const [sourceAnchor, targetAnchor] of anchors) {
    mapChangedRegion(sourceAnchor, targetAnchor)
    mappings[targetAnchor] = [sourceAnchor]
    sourceCursor = sourceAnchor + 1
    targetCursor = targetAnchor + 1
  }
  mapChangedRegion(source.length, target.length)

  return mappings.every((mapping) => mapping.length > 0) ? mappings : null
}

/**
 * Build the connecting map from normalized provider words back to visible
 * character ranges. The renderer ultimately wraps those ranges by word index.
 */
export function buildSpeechDisplayWordAlignment(
  displayText: string,
  speechText: string,
): SpeechDisplayWordAlignment[] | null {
  const displayWords = extractHighlightableWordSpans(displayText)
  const speechWords = extractHighlightableWordSpans(speechText)
  const mappings = mapTargetWordsToSourceWords(
    displayWords.map((word) => word.normalizedText),
    speechWords.map((word) => word.normalizedText),
  )
  if (!mappings) return null

  return speechWords.map((speechWord, speechWordIndex) => {
    const displayRanges = mappings[speechWordIndex].map((displayWordIndex) => {
      const displayWord = displayWords[displayWordIndex]
      return {
        wordIndex: displayWord.wordIndex,
        start: displayWord.start,
        end: displayWord.end,
      }
    })
    return {
      speechWordIndex,
      speechText: speechWord.text,
      speechStart: speechWord.start,
      speechEnd: speechWord.end,
      displayWordIndices: displayRanges.map((range) => range.wordIndex),
      displayRanges,
    }
  })
}

/** Attach each Whisper/estimated timing to the visible words it should paint. */
export function mapWordTimestampsToDisplayWords(
  displayText: string,
  speechText: string,
  timestamps: WordTimestamp[],
): DisplayWordTimestamp[] | null {
  const alignment = buildSpeechDisplayWordAlignment(displayText, speechText)
  if (!alignment || timestamps.length === 0) return null

  const timestampTokens = timestamps.flatMap((timestamp, timestampIndex) =>
    extractHighlightableWordSpans(timestamp.text).map((word) => ({
      timestampIndex,
      normalizedText: word.normalizedText,
    })),
  )
  if (timestampTokens.length === 0) return null

  const timestampToSpeech = mapTargetWordsToSourceWords(
    alignment.map((word) =>
      word.speechText.normalize("NFKC").toLocaleLowerCase(),
    ),
    timestampTokens.map((word) => word.normalizedText),
  )
  if (!timestampToSpeech) return null

  const indicesByTimestamp = Array.from(
    { length: timestamps.length },
    () => new Set<number>(),
  )
  timestampTokens.forEach((token, tokenIndex) => {
    for (const speechWordIndex of timestampToSpeech[tokenIndex]) {
      for (const displayWordIndex of alignment[speechWordIndex]
        .displayWordIndices) {
        indicesByTimestamp[token.timestampIndex].add(displayWordIndex)
      }
    }
  })

  const mapped = timestamps
    .map((timestamp, timestampIndex) => ({
      ...timestamp,
      displayWordIndices: [...indicesByTimestamp[timestampIndex]].sort(
        (a, b) => a - b,
      ),
    }))
    .filter((timestamp) => timestamp.displayWordIndices.length > 0)
  return mapped.length > 0 ? mapped : null
}

/**
 * Re-run the fixed-layout auto-fit pass (`assets/adt/auto-fit.js`, exposed as
 * `window.__adtRunAutoFit`) after we rebuild a paragraph's innerHTML for word
 * wrapping.
 *
 * On fixed-layout pages the auto-fit script shrinks each paragraph's inline
 * `font-size` / `letter-spacing` so the text fits its absolutely-positioned
 * block box. Wrapping words rebuilds the innerHTML from the original
 * `data-segments` (and drops the per-span `data-adt-fs` cache), which
 * reinstates the pre-fit sizes — so without this the text grows and reflows
 * ("jumps around") the instant read-aloud starts, then snaps back on teardown
 * when the stashed fitted HTML is restored. Re-fitting the freshly-wrapped
 * spans keeps the layout stable. Guarded on `data-adt-fit`, so it's a no-op
 * for reflowable pages (which have no fit targets). The translation-swap path
 * in `i18n.ts` re-fits the same way after rebuilding segment spans.
 */
function refitFixedLayout(element: HTMLElement): void {
  if (!element.hasAttribute(FIT_ATTR)) return
  const runAutoFit = (window as Window & { __adtRunAutoFit?: () => void })
    .__adtRunAutoFit
  if (typeof runAutoFit === "function") runAutoFit()
}

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
      // Separators stay OUTSIDE the word-index wrapper (so the highlight box
      // hugs the word), but must still carry the surrounding segment's style:
      // in fixed-layout the font-size lives only on the per-segment span and
      // the paragraph itself has none, so a bare text node would inherit the
      // page default (~16px) and change the spacing between words on play.
      // Route the whitespace run through buildPieces so it keeps the segment's
      // font metrics — mirrors wrapBySegments in packaging/epub.ts.
      if (seg.text.length > 0) {
        for (const piece of buildPieces(charCursor, charCursor + seg.text.length)) {
          fragment.appendChild(piece)
        }
      }
      charCursor += seg.text.length
      continue
    }
    const start = charCursor
    const end = start + seg.text.length
    const wrap = doc.createElement("span")
    wrap.setAttribute("data-word-index", String(seg.wordIndex))
    // The wrapper carries NO font-size on purpose. The highlight is painted on
    // the wrapper AND its inner pieces (see the .bg-yellow-300 rule), and the
    // pieces already carry the word's real font-size/family — so the yellow
    // covers the full word height without the wrapper needing a size. Sizing
    // the wrapper (as we used to) inserts an extra inline box in the page's
    // default font, whose metrics differ from the text's font and shift the
    // line's baseline while read-aloud is active — the text "bobs". An unsized
    // wrapper inherits the small page default (smaller than the text), so it
    // contributes nothing to the line box and the baseline stays put.
    for (const piece of buildPieces(start, end)) wrap.appendChild(piece)
    fragment.appendChild(wrap)
    charCursor = end
  }
  element.replaceChildren(fragment)
  return true
}

/**
 * Wrap visible text nodes without rebuilding their ancestor markup. MathML is
 * treated as one atomic visual target: an HTML wrapper paints the formula while
 * every node inside `<math>` remains untouched and semantically valid.
 */
function wrapWordsPreservingMarkup(element: HTMLElement, text: string): boolean {
  const words = extractHighlightableWordSpans(text)
  if (words.length === 0) return false

  type TextUnit = { kind: "text"; node: Text; start: number; end: number }
  type AtomicUnit = {
    kind: "atomic"
    node: Element
    start: number
    end: number
  }
  const units: Array<TextUnit | AtomicUnit> = []
  let characterOffset = 0

  const collect = (node: Node): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      const textNode = node as Text
      const start = characterOffset
      characterOffset += textNode.data.length
      units.push({ kind: "text", node: textNode, start, end: characterOffset })
      return
    }
    if (!(node instanceof Element)) return

    const tagName = node.tagName.toLowerCase()
    if (tagName === "math" || tagName === "svg") {
      const start = characterOffset
      characterOffset += node.textContent?.length ?? 0
      units.push({
        kind: "atomic",
        node,
        start,
        end: characterOffset,
      })
      return
    }
    for (const child of Array.from(node.childNodes)) collect(child)
  }

  for (const child of Array.from(element.childNodes)) collect(child)

  let wrapped = false
  for (const unit of units) {
    const overlapping = words.filter(
      (word) => word.start < unit.end && word.end > unit.start,
    )
    if (overlapping.length === 0) continue

    if (unit.kind === "atomic") {
      const wrapper = element.ownerDocument.createElement("span")
      wrapper.setAttribute(
        WORD_INDICES_ATTR,
        overlapping.map((word) => word.wordIndex).join(" "),
      )
      unit.node.replaceWith(wrapper)
      wrapper.appendChild(unit.node)
      wrapped = true
      continue
    }

    const fragment = element.ownerDocument.createDocumentFragment()
    let localOffset = 0
    for (const word of overlapping) {
      const start = Math.max(0, word.start - unit.start)
      const end = Math.min(unit.node.data.length, word.end - unit.start)
      if (start > localOffset) {
        fragment.appendChild(
          element.ownerDocument.createTextNode(
            unit.node.data.slice(localOffset, start),
          ),
        )
      }
      const wrapper = element.ownerDocument.createElement("span")
      wrapper.setAttribute("data-word-index", String(word.wordIndex))
      wrapper.textContent = unit.node.data.slice(start, end)
      fragment.appendChild(wrapper)
      localOffset = end
      wrapped = true
    }
    if (localOffset < unit.node.data.length) {
      fragment.appendChild(
        element.ownerDocument.createTextNode(unit.node.data.slice(localOffset)),
      )
    }
    unit.node.replaceWith(fragment)
  }
  return wrapped
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
  if (segments && segments.length > 0 && !element.querySelector("math")) {
    if (wrapWordsFromSegments(element, segments)) {
      refitFixedLayout(element)
      return
    }
    element.removeAttribute(ORIGINAL_HTML_ATTR)
    return
  }

  if (!wrapWordsPreservingMarkup(element, text)) {
    element.removeAttribute(ORIGINAL_HTML_ATTR)
    return
  }
  refitFixedLayout(element)
}

export function unwrapWordsForElement(element: HTMLElement): void {
  const original = element.getAttribute(ORIGINAL_HTML_ATTR)
  if (original === null) return
  element.innerHTML = original
  element.removeAttribute(ORIGINAL_HTML_ATTR)
}

export function setWordHighlights(
  element: HTMLElement,
  wordIndices: readonly number[],
): void {
  // Clear only this element: another item can still be tearing down during a
  // rapid skip. A normalized phrase may intentionally light several words.
  clearWordHighlight(element)
  for (const wordIndex of new Set(wordIndices)) {
    if (wordIndex < 0) continue
    element
      .querySelectorAll<HTMLElement>(
        `[data-word-index="${wordIndex}"], [${WORD_INDICES_ATTR}~="${wordIndex}"]`,
      )
      .forEach((target) => target.classList.add(WORD_HIGHLIGHT_CLASS))
  }
}

export function clearWordHighlight(element: HTMLElement): void {
  element
    .querySelectorAll<HTMLElement>(
      `[data-word-index].${WORD_HIGHLIGHT_CLASS}, [${WORD_INDICES_ATTR}].${WORD_HIGHLIGHT_CLASS}`,
    )
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

/** Resolve playback time directly to the visible words linked by alignment. */
export function findDisplayWordIndicesAtTime(
  timestamps: DisplayWordTimestamp[],
  currentTime: number,
): number[] {
  if (timestamps.length === 0) return []
  for (const timestamp of timestamps) {
    if (currentTime >= timestamp.start && currentTime < timestamp.end) {
      return timestamp.displayWordIndices
    }
  }
  if (currentTime >= timestamps[timestamps.length - 1].end) {
    return timestamps[timestamps.length - 1].displayWordIndices
  }
  return []
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
