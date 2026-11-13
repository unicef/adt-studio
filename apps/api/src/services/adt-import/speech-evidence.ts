import path from "node:path"

import { loadBookConfig, outputEvidence, readOutputCatalog } from "@adt/pipeline"
import { createBookStorage } from "@adt/storage"
import {
  TTSOutput,
  WordTimestampOutput,
  resolveEntryVoiceSlot,
  type OutputStatus,
} from "@adt/types"

export interface ImportedSpeechEvidenceOptions {
  promptsDir: string
  configPath?: string
}

function statusKey(id: string, language: string | undefined, voiceSlot: string | undefined): string {
  return JSON.stringify([id, language ?? "", voiceSlot ?? "primary"])
}

/**
 * Record input evidence for narration recovered from an exported ADT.
 *
 * The archive's audio was generated, but it arrives without the inputs that
 * produced it. Left that way, SPEC-0001 treats it as content of unknown
 * authorship: protected, so a voice-only rerun would keep the old recordings.
 * This accepts each recovered file as the output of the book's speech
 * configuration at import time — the same assumption the import already makes
 * by showing it as current — so a later change of voice, model or
 * instructions makes it an ordinary update instead.
 *
 * Only entries the importer wrote (provider `imported`, no evidence yet) are
 * touched, and only where the catalog has a usable status for them. A book
 * with no resolvable voice keeps its recovered audio unstamped.
 */
export function stampImportedSpeechEvidence(
  label: string,
  booksDir: string,
  options: ImportedSpeechEvidenceOptions,
): void {
  const resolvedBooksDir = path.resolve(booksDir)
  const storage = createBookStorage(label, resolvedBooksDir)
  try {
    const outputs = readOutputCatalog({
      storage,
      config: loadBookConfig(label, resolvedBooksDir, options.configPath),
      bookDir: path.join(resolvedBooksDir, label),
      promptsDir: options.promptsDir,
      configDir: options.configPath
        ? path.join(path.dirname(options.configPath), "config")
        : path.resolve("config"),
      kinds: ["audio", "timestamps"],
    })
    const byKind = (kind: OutputStatus["identity"]["kind"]) => new Map(outputs
      .filter((status) => status.identity.kind === kind && status.usable && !status.excluded)
      .map((status) => [
        statusKey(status.identity.id, status.identity.language, status.identity.voiceSlot),
        status,
      ]))
    const audioStatuses = byKind("audio")
    const timestampStatuses = byKind("timestamps")
    const languages = [...new Set(outputs.flatMap((status) => status.identity.language ? [status.identity.language] : []))]

    for (const language of languages) {
      const ttsRow = storage.getLatestNodeData("tts", language)
      const tts = TTSOutput.safeParse(ttsRow?.data)
      if (!tts.success) continue
      const stampedAudio = new Map<string, string>()
      let audioChanged = false
      const entries = tts.data.entries.map((entry) => {
        if (entry.provider !== "imported" || entry.input || entry.review || entry.speechInputSignature) return entry
        const slot = resolveEntryVoiceSlot(entry)
        const status = audioStatuses.get(statusKey(entry.textId, language, slot))
        if (!status) return entry
        audioChanged = true
        if (entry.audioHash) stampedAudio.set(statusKey(entry.textId, language, slot), entry.audioHash)
        return {
          ...entry,
          source: "ai" as const,
          speechInputSignature: status.signature,
          input: outputEvidence(status.signature, entry.audioHash ?? entry.fileName),
        }
      })
      if (audioChanged) storage.putNodeData("tts", language, TTSOutput.parse({ ...tts.data, entries }))

      const timingRow = storage.getLatestNodeData("tts-timestamps", language)
      const timings = WordTimestampOutput.safeParse(timingRow?.data)
      if (!timings.success) continue
      let timingsChanged = false
      const timingEntries = Object.fromEntries(Object.entries(timings.data.entries).map(([key, timing]) => {
        const slot = resolveEntryVoiceSlot(timing)
        const id = statusKey(timing.textId, language, slot)
        const audioHash = stampedAudio.get(id)
        const status = timestampStatuses.get(id)
        // Only timings of audio stamped above belong to the import.
        if (!audioHash || !status || timing.input || timing.review) return [key, timing]
        timingsChanged = true
        return [key, {
          ...timing,
          source: "ai" as const,
          audioHash,
          input: outputEvidence(status.signature, { words: timing.words, duration: timing.duration }),
        }]
      }))
      if (timingsChanged) {
        storage.putNodeData("tts-timestamps", language, WordTimestampOutput.parse({ ...timings.data, entries: timingEntries }))
      }
    }
  } finally {
    storage.close()
  }
}
