import type { SpeechFileEntry, SpeechFailedEntry } from "@adt/types"

/**
 * In-memory live view of an in-flight speech run, keyed by book label.
 *
 * The speech step only persists its TTS node data once the whole run
 * finishes, but audio files land on disk per item as they're generated. This
 * registry holds live references to the runner's per-language result arrays
 * so GET /books/:label/tts can serve a progressively-growing snapshot while
 * the run is active, letting the Speech view show each audio as it appears.
 *
 * The registry stores the same array/map instances the runner mutates — no
 * copying or per-item bookkeeping. Entries are removed in the runner's
 * `finally`, after the final node data is persisted, so readers fall back to
 * storage without a gap.
 */
interface LiveSpeechRun {
  entriesByLang: Map<string, SpeechFileEntry[]>
  failedByLang: Map<string, SpeechFailedEntry[]>
  startedAt: string
}

const liveRuns = new Map<string, LiveSpeechRun>()

export function beginSpeechRun(
  label: string,
  entriesByLang: Map<string, SpeechFileEntry[]>,
  failedByLang: Map<string, SpeechFailedEntry[]>,
): void {
  liveRuns.set(label, {
    entriesByLang,
    failedByLang,
    startedAt: new Date().toISOString(),
  })
}

export function endSpeechRun(label: string): void {
  liveRuns.delete(label)
}

export interface LiveSpeechSnapshot {
  startedAt: string
  languages: Record<string, { entries: SpeechFileEntry[]; failed: SpeechFailedEntry[] }>
}

/** Snapshot of the live run for a book, or null when no speech run is active. */
export function getLiveSpeechRun(label: string): LiveSpeechSnapshot | null {
  const run = liveRuns.get(label)
  if (!run) return null
  const languages: LiveSpeechSnapshot["languages"] = {}
  for (const [lang, entries] of run.entriesByLang) {
    languages[lang] = {
      entries: [...entries],
      failed: [...(run.failedByLang.get(lang) ?? [])],
    }
  }
  return { startedAt: run.startedAt, languages }
}
