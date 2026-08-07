/**
 * Word-level tokenization helpers for TTS highlighting.
 * Direct port of `assets/adt/modules/tts_highlighter_utils.js` to TypeScript.
 *
 * The pattern matches Unicode letters, digits, marks, and a small set of
 * intra-word punctuation (apostrophe, curly apostrophe, hyphen) so contractions
 * and hyphenated words stay intact.
 */
const WORD_PATTERN = /[\p{L}\p{N}\p{M}]+(?:[’'-][\p{L}\p{N}\p{M}]+)*/gu

export interface WordTimestamp {
  text: string
  start: number
  end: number
}

export interface HighlightableWord {
  text: string
  normalizedText: string
  wordIndex: number
  start: number
  end: number
}

export type RenderSegment =
  | { type: "separator"; text: string }
  | { type: "word"; text: string; normalizedText: string; wordIndex: number }

export function normalizeHighlightText(text: unknown): string {
  return String(text ?? "")
    .replace(/\s+/g, " ")
    .trim()
}

export function extractHighlightableWords(text: unknown): string[] {
  return extractHighlightableWordSpans(text).map((word) => word.text)
}

/** Word tokens plus their character ranges in the original string. */
export function extractHighlightableWordSpans(text: unknown): HighlightableWord[] {
  const source = String(text ?? "")
  return Array.from(source.matchAll(WORD_PATTERN), (match, wordIndex) => {
    const start = match.index ?? 0
    return {
      text: match[0],
      normalizedText: match[0].normalize("NFKC").toLocaleLowerCase(),
      wordIndex,
      start,
      end: start + match[0].length,
    }
  })
}

export function normalizeGlossaryText(text: unknown): string {
  return extractHighlightableWords(String(text ?? "").toLowerCase()).join(" ").trim()
}

export function getApproximateWordWeight(word: unknown): number {
  const normalized = normalizeGlossaryText(word).replace(/\s+/g, "")
  return Math.max(1, normalized.length || String(word ?? "").length || 1)
}

export function createApproximateWordTimestamps(
  text: unknown,
  audioDuration: number,
): WordTimestamp[] {
  const words = extractHighlightableWords(normalizeHighlightText(text))
  if (words.length === 0) return []

  const duration =
    Number.isFinite(audioDuration) && audioDuration > 0
      ? audioDuration
      : Math.max(words.length * 0.42, 0.8)
  const totalWeight = words.reduce((sum, w) => sum + getApproximateWordWeight(w), 0)

  let cursor = 0
  return words.map((word, index) => {
    const start = cursor
    if (index === words.length - 1) {
      cursor = duration
    } else {
      cursor += duration * (getApproximateWordWeight(word) / totalWeight)
    }
    return { text: word, start, end: cursor }
  })
}

export function buildWordRenderPlan(text: unknown): RenderSegment[] {
  const source = String(text ?? "")
  const segments: RenderSegment[] = []
  let lastIndex = 0
  let wordIndex = 0

  for (const match of source.matchAll(WORD_PATTERN)) {
    const start = match.index ?? 0
    if (start > lastIndex) {
      segments.push({ type: "separator", text: source.slice(lastIndex, start) })
    }
    segments.push({
      type: "word",
      text: match[0],
      normalizedText: normalizeGlossaryText(match[0]),
      wordIndex,
    })
    wordIndex += 1
    lastIndex = start + match[0].length
  }

  if (lastIndex < source.length) {
    segments.push({ type: "separator", text: source.slice(lastIndex) })
  }

  return segments
}

export function isWordHighlightEnabled(
  highlightFeatureEnabled: boolean,
  wordHighlightMode = true,
): boolean {
  return Boolean(highlightFeatureEnabled) && wordHighlightMode !== false
}

export function shouldUseBlockPlaybackHighlight(
  element: { tagName?: string } | null | undefined,
  highlightFeatureEnabled: boolean,
  wordHighlightMode = true,
): boolean {
  const tagName = element?.tagName?.toLowerCase?.()
  if (!tagName) return false
  if (!isWordHighlightEnabled(highlightFeatureEnabled, wordHighlightMode)) return true
  return tagName === "img" || tagName === "input" || tagName === "textarea"
}

export function getHighlightDisplayText(
  element: { textContent?: string | null } | null | undefined,
  translatedText: unknown,
): string {
  const renderedText = String(element?.textContent ?? "")
  return normalizeHighlightText(renderedText).length > 0
    ? renderedText
    : String(translatedText ?? "")
}
