/**
 * Loads `./content/i18n/<lang>/timecode/timecode_output.json` and writes
 * the flattened word-timestamp map into `timecodeMapsAtom`, alongside the
 * per-narrator maps from the optional `timecode_voices.json` companion.
 *
 * The legacy on-disk format wraps each entry as `{ timecodes: [null, { word_timestamps }] }`
 * for compatibility with an earlier multi-track timecode shape. We flatten
 * that here so consumers (the audio player + word highlighter) just deal
 * with `Record<textId, WordTimestamp[]>`.
 */
import { getDefaultStore } from "jotai"
import { timecodeMapsAtom, type TimecodeMap, type WordTimestamp } from "@/features/audio/state/audio.atoms"

interface RawTimecodeEntry {
  timecodes?: [unknown, { word_timestamps?: WordTimestamp[] }]
}

export async function loadTimecodes(
  lang: string,
  bundleVersion?: string,
): Promise<TimecodeMap> {
  const versionParam = bundleVersion ? `?v=${bundleVersion}` : ""
  const url = `./content/i18n/${lang}/timecode/timecode_output.json${versionParam}`
  const voicesUrl = `./content/i18n/${lang}/timecode/timecode_voices.json${versionParam}`
  try {
    const res = await fetch(url)
    if (!res.ok) {
      getDefaultStore().set(timecodeMapsAtom, { primary: {}, secondary: {} })
      return {}
    }
    const raw = (await res.json()) as Record<string, RawTimecodeEntry>
    const map = flattenTimecodes(raw)
    let maps: Record<"primary" | "secondary", TimecodeMap> = {
      primary: map,
      secondary: {},
    }
    try {
      const voicesRes = await fetch(voicesUrl)
      if (voicesRes.ok) {
        const voicesRaw = (await voicesRes.json()) as Record<
          "primary" | "secondary",
          Record<string, RawTimecodeEntry>
        >
        maps = {
          primary: flattenTimecodes(voicesRaw.primary ?? {}),
          secondary: flattenTimecodes(voicesRaw.secondary ?? {}),
        }
      }
    } catch {
      // Optional for legacy and single-narrator packages.
    }
    getDefaultStore().set(timecodeMapsAtom, maps)
    return map
  } catch (err) {
    console.warn(`[tts] failed to load ${url}`, err)
    getDefaultStore().set(timecodeMapsAtom, { primary: {}, secondary: {} })
    return {}
  }
}

function flattenTimecodes(raw: Record<string, RawTimecodeEntry>): TimecodeMap {
  const map: TimecodeMap = {}
  for (const [textId, entry] of Object.entries(raw)) {
    const words = entry.timecodes?.[1]?.word_timestamps
    if (Array.isArray(words) && words.length > 0) map[textId] = words
  }
  return map
}
