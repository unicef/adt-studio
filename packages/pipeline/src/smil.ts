/**
 * Build EPUB 3 Media Overlay (SMIL) documents from paragraph audio + whisper
 * word timestamps. Pure module — no filesystem access. Caller wires inputs
 * and writes the returned XML to disk.
 *
 * Per-paragraph emission: word-level `<par>` per word when the source word
 * span count exactly matches the whisper word count; paragraph-level
 * fallback otherwise. No alignment / interpolation — if the counts
 * diverge, an EPUB reader gets a single highlight for the whole paragraph
 * instead of (potentially) wrong word timing.
 */
import { escapeHtml } from "./html-escape.js"

export interface SmilWordTimestamp {
  word: string
  start: number
  end: number
}

export interface SmilParagraph {
  /** data-id of the source `<p>` — used as the fragment for paragraph-level
   *  fallback and as the seq id stem. */
  paragraphId: string
  /** Path to the audio file relative to the SMIL document's location
   *  (e.g. `../en/audio/pg001_p001.mp3`). */
  audioPath: string
  /** Total length of the audio file in seconds. Used in media:duration
   *  metadata aggregation. */
  audioDuration: number
  /** Renderer-emitted word span ids in document order. Empty → no
   *  word-level data for this paragraph (always paragraph-level). */
  wordIds: string[]
  /** Whisper word timestamps in audio order. Empty → paragraph has no
   *  audio at all and is skipped from the SMIL entirely. */
  whisperWords: SmilWordTimestamp[]
}

export interface BuildSmilOptions {
  /** Path to the page HTML (XHTML) relative to the SMIL document
   *  (e.g. `../pg001_sec001.xhtml`). All `<text src="…#…"/>` references
   *  are built from this. */
  pageHref: string
  paragraphs: SmilParagraph[]
}

export interface SmilOutput {
  xml: string
  /** Sum of `audioDuration` across paragraphs that contributed to the SMIL
   *  (i.e. excluding paragraphs skipped for missing audio). Caller emits
   *  this as `<meta property="media:duration" refines="#…">PT…S</meta>`. */
  durationSeconds: number
}

/**
 * @returns SMIL document + total duration, or `null` when no paragraphs
 *   produce audio (caller skips writing the file and the OPF entry).
 */
export function buildSmil(options: BuildSmilOptions): SmilOutput | null {
  const { pageHref, paragraphs } = options
  const seqs: string[] = []
  let totalDuration = 0
  let parIdCounter = 0

  for (const p of paragraphs) {
    if (p.whisperWords.length === 0) continue
    totalDuration += p.audioDuration

    const wordLevel =
      p.wordIds.length > 0 && p.wordIds.length === p.whisperWords.length

    const parLines: string[] = []
    if (wordLevel) {
      for (let i = 0; i < p.wordIds.length; i++) {
        parIdCounter += 1
        const word = p.whisperWords[i]
        parLines.push(
          `      <par id="par${pad(parIdCounter)}">`,
          `        <text src="${escapeHtml(pageHref)}#${escapeHtml(p.wordIds[i])}"/>`,
          `        <audio src="${escapeHtml(p.audioPath)}" clipBegin="${formatClock(word.start)}" clipEnd="${formatClock(word.end)}"/>`,
          `      </par>`,
        )
      }
    } else {
      parIdCounter += 1
      parLines.push(
        `      <par id="par${pad(parIdCounter)}">`,
        `        <text src="${escapeHtml(pageHref)}#${escapeHtml(p.paragraphId)}"/>`,
        `        <audio src="${escapeHtml(p.audioPath)}" clipBegin="${formatClock(0)}" clipEnd="${formatClock(p.audioDuration)}"/>`,
        `      </par>`,
      )
    }

    seqs.push(
      `    <seq id="seq-${escapeHtml(p.paragraphId)}" epub:textref="${escapeHtml(pageHref)}#${escapeHtml(p.paragraphId)}">`,
      ...parLines,
      `    </seq>`,
    )
  }

  if (seqs.length === 0) return null

  const xml = `<?xml version="1.0" encoding="utf-8"?>
<smil xmlns="http://www.w3.org/ns/SMIL" xmlns:epub="http://www.idpf.org/2007/ops" version="3.0">
  <body>
${seqs.join("\n")}
  </body>
</smil>`

  return { xml, durationSeconds: totalDuration }
}

/**
 * Format a duration as an EPUB media:duration `PTnnnS` clock value.
 * Three decimal places match SMIL convention and EPUBCheck expectations.
 */
export function formatMediaDuration(seconds: number): string {
  return `PT${seconds.toFixed(3)}S`
}

function formatClock(seconds: number): string {
  return `${seconds.toFixed(3)}s`
}

function pad(n: number): string {
  return String(n).padStart(4, "0")
}

