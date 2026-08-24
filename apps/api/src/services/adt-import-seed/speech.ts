import fs from "node:fs"
import path from "node:path"

import { normalizeLocale } from "@adt/pipeline"
import { createBookStorage } from "@adt/storage"
import { TTSOutput, WordTimestampOutput } from "@adt/types"

import { readAdtBundle } from "../adt-bundle-reader.js"

export function seedImportedSpeech(
  label: string,
  booksDir: string,
  bundle: ReturnType<typeof readAdtBundle>,
  files: Record<string, Uint8Array>,
  sourceContentChanged: boolean,
  generatedAt: string,
): void {
  if (sourceContentChanged) return
  const bookDir = path.join(path.resolve(booksDir), label)
  const storage = createBookStorage(label, booksDir)
  let recoveredSpeech = false
  let recoveredTimestamps = false
  try {
    for (const archiveLanguage of bundle.manifest.languages.output) {
      const language = normalizeLocale(archiveLanguage)
      const audioMapPath = `${bundle.root}content/i18n/${archiveLanguage}/audios.json`
      const audioMapBytes = files[audioMapPath]
      if (!audioMapBytes) continue
      let audioMap: Record<string, unknown>
      try {
        const parsed = JSON.parse(new TextDecoder().decode(audioMapBytes)) as unknown
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) continue
        audioMap = parsed as Record<string, unknown>
      } catch {
        continue
      }

      const audioDir = path.join(bookDir, "audio", language)
      const entries: TTSOutput["entries"] = []
      for (const [textId, fileValue] of Object.entries(audioMap)) {
        if (typeof fileValue !== "string" || path.basename(fileValue) !== fileValue) continue
        const extension = path.extname(fileValue).toLowerCase()
        if (![".mp3", ".wav", ".ogg", ".flac"].includes(extension)) continue
        const bytes = files[`${bundle.root}content/i18n/${archiveLanguage}/audio/${fileValue}`]
        if (!bytes) continue
        fs.mkdirSync(audioDir, { recursive: true })
        fs.writeFileSync(path.join(audioDir, fileValue), bytes)
        entries.push({
          textId,
          language,
          fileName: fileValue,
          voice: "imported",
          model: "imported-adt",
          cached: false,
          provider: "imported",
        })
      }
      if (entries.length === 0) continue
      storage.putNodeData("tts", language, TTSOutput.parse({ entries, generatedAt }))
      recoveredSpeech = true

      const timecodePath = `${bundle.root}content/i18n/${archiveLanguage}/timecode/timecode_output.json`
      const timecodeBytes = files[timecodePath]
      if (!timecodeBytes) continue
      try {
        const runtime = JSON.parse(new TextDecoder().decode(timecodeBytes)) as Record<string, {
          timecodes?: [unknown, { word_timestamps?: Array<{ text?: unknown; start?: unknown; end?: unknown }> }]
        }>
        const timestampEntries: WordTimestampOutput["entries"] = {}
        for (const [textId, value] of Object.entries(runtime)) {
          const words = value?.timecodes?.[1]?.word_timestamps
            ?.filter((word) => typeof word.text === "string"
              && typeof word.start === "number"
              && typeof word.end === "number")
            .map((word) => ({ word: word.text as string, start: word.start as number, end: word.end as number }))
            ?? []
          if (words.length === 0) continue
          timestampEntries[textId] = {
            textId,
            language,
            words,
            duration: Math.max(...words.map((word) => word.end)),
          }
        }
        if (Object.keys(timestampEntries).length > 0) {
          storage.putNodeData("tts-timestamps", language, WordTimestampOutput.parse({
            entries: timestampEntries,
            generatedAt,
          }))
          recoveredTimestamps = true
        }
      } catch {
        // Invalid optional timestamps do not discard otherwise valid audio.
      }
    }
    if (recoveredSpeech) storage.markStepCompleted("tts", "Recovered from exported ADT audio")
    if (recoveredTimestamps) {
      storage.markStepCompleted("word-timestamps", "Recovered from exported ADT timecodes")
    }
  } finally {
    storage.close()
  }
}

