import fs from "node:fs"
import path from "node:path"

import { createBookStorage } from "@adt/storage"
import { TextCatalogOutput, TTSOutput, WordTimestampOutput } from "@adt/types"

import type { ReadAdtBundle } from "../bundle-reader.js"
import { recoverImportedAudio, stableImportedTextIds } from "../speech.js"

function readTimestamps(
  bytes: Uint8Array | undefined,
  language: string,
): WordTimestampOutput["entries"] {
  if (!bytes) return {}
  let runtime: Record<string, {
    timecodes?: [unknown, { word_timestamps?: Array<{ text?: unknown; start?: unknown; end?: unknown }> }]
  }>
  try {
    runtime = JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    return {}
  }
  if (!runtime || typeof runtime !== "object" || Array.isArray(runtime)) return {}
  const entries: WordTimestampOutput["entries"] = {}
  for (const [textId, value] of Object.entries(runtime)) {
    const words = value?.timecodes?.[1]?.word_timestamps
      ?.filter((word) => typeof word.text === "string"
        && typeof word.start === "number"
        && typeof word.end === "number")
      .map((word) => ({ word: word.text as string, start: word.start as number, end: word.end as number }))
      ?? []
    if (words.length === 0) continue
    entries[textId] = {
      textId,
      language,
      words,
      duration: Math.max(...words.map((word) => word.end)),
    }
  }
  return entries
}

/** Adopt the archive's narration for every text whose recovered copy still
 * matches the published one. A locale that already has speech data keeps it,
 * so a re-projection only fills in what is missing — including the step
 * statuses the Speech stage needs to count as complete. */
export function seedImportedSpeech(
  label: string,
  booksDir: string,
  bundle: ReadAdtBundle,
  files: Record<string, Uint8Array>,
  generatedAt: string,
): void {
  const bookDir = path.join(path.resolve(booksDir), label)
  const storage = createBookStorage(label, booksDir)
  try {
    const catalog = TextCatalogOutput.safeParse(storage.getLatestNodeData("text-catalog", "book")?.data)
    const stableIds = stableImportedTextIds(
      catalog.success ? catalog.data.entries : [],
      bundle.texts[bundle.manifest.languages.source] ?? {},
    )
    const recovered = recoverImportedAudio(bundle, files, stableIds)
    let hasSpeech = false
    let hasTimestamps = false
    for (const { language, archiveLanguage, entries } of recovered) {
      const legacyLanguage = language.replace("-", "_")
      const existingSpeech = storage.getLatestNodeData("tts", language)
        ?? storage.getLatestNodeData("tts", legacyLanguage)
      if (existingSpeech) {
        hasSpeech = true
      } else {
        const audioDir = path.join(bookDir, "audio", language)
        fs.mkdirSync(audioDir, { recursive: true })
        for (const entry of entries) {
          fs.writeFileSync(path.join(audioDir, entry.fileName), entry.bytes)
        }
        storage.putNodeData("tts", language, TTSOutput.parse({
          entries: entries.map((entry) => ({
            textId: entry.textId,
            language,
            fileName: entry.fileName,
            voice: "imported",
            model: "imported-adt",
            cached: false,
            provider: "imported",
          })),
          generatedAt,
        }))
        hasSpeech = true
      }

      const existingTimestamps = storage.getLatestNodeData("tts-timestamps", language)
        ?? storage.getLatestNodeData("tts-timestamps", legacyLanguage)
      if (existingTimestamps) {
        hasTimestamps = true
        continue
      }
      const timestampEntries = readTimestamps(
        files[`${bundle.root}content/i18n/${archiveLanguage}/timecode/timecode_output.json`],
        language,
      )
      if (Object.keys(timestampEntries).length === 0) continue
      storage.putNodeData("tts-timestamps", language, WordTimestampOutput.parse({
        entries: timestampEntries,
        generatedAt,
      }))
      hasTimestamps = true
    }
    if (!hasSpeech) return
    const status = new Map(storage.getStepRuns().map((run) => [run.step, run.status]))
    if (status.get("tts") !== "done") {
      storage.markStepCompleted("tts", "Recovered from exported ADT audio")
    }
    if (hasTimestamps) {
      if (status.get("word-timestamps") !== "done") {
        storage.markStepCompleted("word-timestamps", "Recovered from exported ADT timecodes")
      }
    } else if (status.get("word-timestamps") !== "done" && status.get("word-timestamps") !== "skipped") {
      storage.markStepSkipped("word-timestamps")
    }
  } finally {
    storage.close()
  }
}
