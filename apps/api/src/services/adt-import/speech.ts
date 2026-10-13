import path from "node:path"

import { normalizeLocale } from "@adt/pipeline"

import type { ReadAdtBundle } from "./bundle-reader.js"

const AUDIO_EXTENSIONS = new Set([".mp3", ".wav", ".ogg", ".flac"])

export interface RecoverableAudioEntry {
  textId: string
  fileName: string
  bytes: Uint8Array
}

export interface RecoverableAudioLanguage {
  language: string
  archiveLanguage: string
  entries: RecoverableAudioEntry[]
}

/** Catalog ids whose recovered text still equals the archive's `texts.json`:
 * narration recorded for that text is still narration for the book. An entry
 * edited outside Studio keeps its text but drops its now-mismatched audio. */
export function stableImportedTextIds(
  catalogEntries: ReadonlyArray<{ id: string; text: string }>,
  sourceTexts: Record<string, string>,
): Set<string> {
  return new Set(
    catalogEntries
      .filter((entry) => sourceTexts[entry.id] === entry.text)
      .map((entry) => entry.id),
  )
}

function parseAudioMap(bytes: Uint8Array | undefined): Record<string, unknown> | null {
  if (!bytes) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null
  return parsed as Record<string, unknown>
}

/** Narration files the archive carries for stable text ids, per output locale. */
export function recoverImportedAudio(
  bundle: ReadAdtBundle,
  files: Record<string, Uint8Array>,
  stableTextIds: ReadonlySet<string>,
): RecoverableAudioLanguage[] {
  const recovered: RecoverableAudioLanguage[] = []
  for (const archiveLanguage of bundle.manifest.languages.output) {
    const audioMap = parseAudioMap(files[`${bundle.root}content/i18n/${archiveLanguage}/audios.json`])
    if (!audioMap) continue
    const entries: RecoverableAudioEntry[] = []
    for (const [textId, fileName] of Object.entries(audioMap)) {
      if (!stableTextIds.has(textId)) continue
      if (typeof fileName !== "string" || path.basename(fileName) !== fileName) continue
      if (!AUDIO_EXTENSIONS.has(path.extname(fileName).toLowerCase())) continue
      const bytes = files[`${bundle.root}content/i18n/${archiveLanguage}/audio/${fileName}`]
      if (!bytes) continue
      entries.push({ textId, fileName, bytes })
    }
    if (entries.length === 0) continue
    recovered.push({ language: normalizeLocale(archiveLanguage), archiveLanguage, entries })
  }
  return recovered
}
