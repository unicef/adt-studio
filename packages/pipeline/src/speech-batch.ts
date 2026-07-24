/**
 * Page-batched TTS helpers (pure core).
 *
 * When a whole page is synthesized in ONE request (so Gemini keeps a consistent
 * tone across sentences), we get back one continuous audio file and one flat
 * list of Whisper word timestamps. To stay compatible with the rest of the
 * pipeline — which expects one audio file per text entry — we must cut that
 * page audio back into per-entry pieces. This module figures out WHERE to cut.
 *
 * The cut points are word onsets: entry k's audio runs from the onset of its
 * first word to the onset of the next entry's first word, so the slices tile
 * the whole file with no lost audio. Finding each entry's first-word onset only
 * needs the entry's known text aligned against Whisper's (possibly imperfect)
 * transcript — we use a longest-common-subsequence match so dropped/added/
 * mis-heard words don't derail the boundaries.
 */

export interface BatchEntry {
  id: string
  text: string
}

export interface EntryTimeRange {
  id: string
  /** Slice start in seconds (inclusive). */
  start: number
  /** Slice end in seconds (exclusive). */
  end: number
}

export interface WhisperWord {
  word: string
  start: number
  end: number
}

/** Above this token-pair count we skip the O(N·M) LCS and use proportional
 *  splitting instead. Pages never approach this (Gemini caps input at a few KB),
 *  but it guards against pathological inputs. */
const MAX_LCS_CELLS = 4_000_000

/**
 * Languages whose normal writing system does not reliably separate words with
 * spaces. The current LCS alignment tokenizes on whitespace, so page batching
 * can produce incorrect slice boundaries for these languages. Keep them on the
 * per-entry TTS path until the aligner has script-aware tokenization.
 */
const PAGE_BATCH_UNSUPPORTED_BASE_LANGUAGES = new Set(["zh", "th"])

export function supportsPageBatchedSpeech(languageCode: string): boolean {
  const normalized = languageCode.trim().replace(/_/g, "-").toLowerCase()
  const baseLanguage = normalized.split("-")[0]
  return !PAGE_BATCH_UNSUPPORTED_BASE_LANGUAGES.has(baseLanguage)
}

function normalizeToken(s: string): string {
  return s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "")
}

function tokenize(text: string): string[] {
  return text
    .split(/\s+/)
    .map(normalizeToken)
    .filter((t) => t.length > 0)
}

/**
 * Longest common subsequence between two token lists. Returns matched index
 * pairs `[expectedIdx, whisperIdx]` in increasing order.
 */
function lcsPairs(a: string[], b: string[]): Array<[number, number]> {
  const n = a.length
  const m = b.length
  if (n === 0 || m === 0) return []

  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1])
    }
  }

  const pairs: Array<[number, number]> = []
  let i = n
  let j = m
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      pairs.push([i - 1, j - 1])
      i--
      j--
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      i--
    } else {
      j--
    }
  }
  pairs.reverse()
  return pairs
}

/**
 * Assign each entry a contiguous `[start, end)` time range within a single
 * page audio file. Ranges tile `[0, totalDuration]` in order: entry 0 starts at
 * 0, each later entry starts at the onset of its first spoken word, and the
 * last entry ends at `totalDuration`. Always returns one range per entry, in
 * input order, monotonically non-decreasing.
 */
export function computeEntryTimeRanges(
  entries: BatchEntry[],
  whisperWords: WhisperWord[],
  totalDuration: number,
): EntryTimeRange[] {
  if (entries.length === 0) return []
  if (entries.length === 1) {
    return [{ id: entries[0].id, start: 0, end: totalDuration }]
  }

  // Flatten expected tokens, remembering which entry each token came from and
  // where each entry's tokens begin.
  const expTokens: string[] = []
  const firstTokenOfEntry: number[] = []
  for (const entry of entries) {
    firstTokenOfEntry.push(expTokens.length)
    for (const tok of tokenize(entry.text)) expTokens.push(tok)
  }

  const whTokens = whisperWords.map((w) => normalizeToken(w.word))

  // Map each expected-token index → whisper-word index it aligns to (if any).
  const expToWhisper = new Array<number>(expTokens.length).fill(-1)
  if (expTokens.length > 0 && whTokens.length > 0 &&
      expTokens.length * whTokens.length <= MAX_LCS_CELLS) {
    for (const [ei, wj] of lcsPairs(expTokens, whTokens)) expToWhisper[ei] = wj
  }

  // Onset of each entry's first word = start time of the earliest aligned
  // whisper word at or after the entry's first token. Undefined when the entry
  // has no aligned tokens (filled by interpolation below).
  const onset = new Array<number | undefined>(entries.length).fill(undefined)
  for (let k = 0; k < entries.length; k++) {
    const start = firstTokenOfEntry[k]
    const end = k + 1 < entries.length ? firstTokenOfEntry[k + 1] : expTokens.length
    for (let ei = start; ei < end; ei++) {
      const wj = expToWhisper[ei]
      if (wj >= 0) {
        onset[k] = whisperWords[wj].start
        break
      }
    }
  }

  // Boundaries: entry 0 always starts at 0; later entries start at their onset.
  const boundary = new Array<number>(entries.length)
  boundary[0] = 0
  for (let k = 1; k < entries.length; k++) {
    boundary[k] = onset[k] ?? Number.NaN
  }

  // Fill gaps (NaN) by linear interpolation between the nearest known
  // boundaries, using expected-token position as the interpolation axis so a
  // long entry gets proportionally more room than a short one.
  const tokenPos = (k: number): number =>
    k < entries.length ? firstTokenOfEntry[k] : expTokens.length
  for (let k = 1; k < entries.length; k++) {
    if (!Number.isNaN(boundary[k])) continue
    let prev = k - 1
    while (prev > 0 && Number.isNaN(boundary[prev])) prev--
    let next = k + 1
    while (next < entries.length && Number.isNaN(boundary[next])) next++
    const prevTime = boundary[prev] // boundary[0] is always 0 → defined
    const nextTime = next < entries.length ? boundary[next] : totalDuration
    const prevAxis = tokenPos(prev)
    const nextAxis = next < entries.length ? tokenPos(next) : expTokens.length
    const span = nextAxis - prevAxis
    const frac = span > 0 ? (tokenPos(k) - prevAxis) / span : 0
    boundary[k] = prevTime + frac * (nextTime - prevTime)
  }

  // Enforce monotonic, in-bounds boundaries so slices never invert or overrun.
  for (let k = 1; k < entries.length; k++) {
    if (!Number.isFinite(boundary[k])) boundary[k] = boundary[k - 1]
    boundary[k] = Math.min(Math.max(boundary[k], boundary[k - 1]), totalDuration)
  }

  return entries.map((entry, k) => ({
    id: entry.id,
    start: boundary[k],
    end: k + 1 < entries.length ? boundary[k + 1] : totalDuration,
  }))
}

/** Join entry texts into one transcript for a single synthesis request. A blank
 *  line between entries nudges the model to treat them as separate sentences /
 *  paragraphs without inventing spoken filler. */
export function buildPageTranscript(entries: BatchEntry[]): string {
  return entries.map((e) => e.text.trim()).filter(Boolean).join("\n\n")
}
