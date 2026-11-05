import path from "node:path"

import { normalizeLocale } from "@adt/pipeline"

import type { ReadAdtBundle } from "./bundle-reader.js"
import { compareWithExportBaseline } from "./catalog.js"

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

/** Catalog ids whose recovered text still equals the archive's `texts.json`.
 * An entry edited in only one of the two keeps its text but drops its now-
 * mismatched audio. */
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

/** The exporter's prepared speech (`speech_texts.json`) for one archive
 * locale, or null when the archive carries none for it. */
export function readArchivedSpeechTexts(
  bundle: ReadAdtBundle,
  files: Record<string, Uint8Array>,
  archiveLanguage: string | undefined,
): Record<string, string> | null {
  if (!archiveLanguage) return null
  const parsed = parseJsonObject(files[`${bundle.root}content/i18n/${archiveLanguage}/speech_texts.json`])
  if (!parsed) return null
  return Object.fromEntries(
    Object.entries(parsed)
      .filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  )
}

/**
 * Whether archived narration can still be presented as current for a text.
 * Only an export verified unchanged against its baseline vouches for every
 * entry. Otherwise the shipped guide lets the HTML and `texts.json` be edited
 * together, so their agreement proves nothing: the narration is trusted only
 * where the words it was prepared from are exactly the words now displayed.
 * An archive without `speech_texts.json` has no such record to check, so only
 * the HTML/`texts.json` agreement applies to it.
 */
export function archivedSpeechIsCurrent(
  exportUnchanged: boolean,
  displayText: string,
  archivedSpeechTexts: Record<string, string> | null,
  textId: string,
): boolean {
  if (exportUnchanged || archivedSpeechTexts === null) return true
  return archivedSpeechTexts[textId] === displayText
}

export function isExportUnchanged(bundle: ReadAdtBundle): boolean {
  return compareWithExportBaseline(bundle) === "unchanged"
}

/** Per archive locale and text id: may the archive's audio be adopted? */
export function currentImportedNarration(
  bundle: ReadAdtBundle,
  files: Record<string, Uint8Array>,
  catalogEntries: ReadonlyArray<{ id: string; text: string }>,
): (archiveLanguage: string, textId: string) => boolean {
  const stableIds = stableImportedTextIds(
    catalogEntries,
    bundle.texts[bundle.manifest.languages.source] ?? {},
  )
  const exportUnchanged = isExportUnchanged(bundle)
  const speechByLanguage = new Map<string, Record<string, string> | null>()
  return (archiveLanguage, textId) => {
    if (!stableIds.has(textId)) return false
    const displayText = bundle.texts[archiveLanguage]?.[textId]
    if (displayText === undefined) return false
    if (!speechByLanguage.has(archiveLanguage)) {
      speechByLanguage.set(archiveLanguage, readArchivedSpeechTexts(bundle, files, archiveLanguage))
    }
    return archivedSpeechIsCurrent(
      exportUnchanged,
      displayText,
      speechByLanguage.get(archiveLanguage) ?? null,
      textId,
    )
  }
}

function parseJsonObject(bytes: Uint8Array | undefined): Record<string, unknown> | null {
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

/** Narration files the archive carries for current texts, per output locale. */
export function recoverImportedAudio(
  bundle: ReadAdtBundle,
  files: Record<string, Uint8Array>,
  isCurrent: (archiveLanguage: string, textId: string) => boolean,
): RecoverableAudioLanguage[] {
  const recovered: RecoverableAudioLanguage[] = []
  for (const archiveLanguage of bundle.manifest.languages.output) {
    const audioMap = parseJsonObject(files[`${bundle.root}content/i18n/${archiveLanguage}/audios.json`])
    if (!audioMap) continue
    const entries: RecoverableAudioEntry[] = []
    for (const [textId, fileName] of Object.entries(audioMap)) {
      if (!isCurrent(archiveLanguage, textId)) continue
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
