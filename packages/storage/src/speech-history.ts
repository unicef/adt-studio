import { storeImmutableAsset } from "./immutable-assets.js"
import fs from "node:fs"
import path from "node:path"
import { createHash } from "node:crypto"
import { TTSOutput, WordTimestampOutput, voiceSlotEntryId, type SpeechFileEntry } from "@adt/types"
import type { Storage } from "./storage.js"

function equal(a: unknown, b: unknown) { return JSON.stringify(a) === JSON.stringify(b) }

function verifyAudio(bookDir: string, language: string, entry: SpeechFileEntry): void {
  if (!/^[a-zA-Z0-9_-]+$/.test(language) || path.basename(entry.fileName) !== entry.fileName) throw new Error("Invalid audio path")
  const root = fs.realpathSync(bookDir)
  const file = fs.realpathSync(path.join(root, "audio", language, entry.fileName))
  const relative = path.relative(root, file)
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Audio path escapes book")
  const bytes = fs.readFileSync(file)
  if (!bytes.length || entry.audioHash && createHash("sha256").update(bytes).digest("hex") !== entry.audioHash) throw new Error("Audio asset is missing or changed")
}

/** Publish a paired manifest. Unmatched old timings remain historical but can
 * never be served alongside different audio. Caller holds book admission. */
export function publishSpeechOutput(storage: Storage, language: string, output: TTSOutput, timestamps?: WordTimestampOutput): number {
  return storage.transaction(() => {
    const previous = storage.getLatestNodeData("tts", language)
    const old = TTSOutput.safeParse(previous?.data)
    const timestampRow = storage.getLatestNodeData("tts-timestamps", language)
    const oldTiming = WordTimestampOutput.safeParse(timestampRow?.data)
    if (old.success && previous && storage.bookDir && old.data.entries.some((entry) => !entry.audioHash)) {
      const snapshots = old.data.entries.map((entry) => {
        try { verifyAudio(storage.bookDir!, language, entry) } catch { return entry }
        const bytes = fs.readFileSync(path.join(storage.bookDir!, "audio", language, entry.fileName))
        const asset = storeImmutableAsset(storage.bookDir!, ["audio", language], voiceSlotEntryId(entry.textId, entry.voiceSlot), path.extname(entry.fileName).slice(1), bytes)
        return { ...entry, fileName: asset.fileName, audioHash: asset.contentHash }
      })
      if (snapshots.some((entry, index) => entry.fileName !== old.data.entries[index].fileName)) storage.putNodeData("tts", language, { ...old.data, entries: snapshots, timingVersion: timestampRow?.version ?? null, legacySnapshotOf: previous.version })
    }
    const entries: WordTimestampOutput["entries"] = {}
    for (const audio of output.entries) {
      const key = voiceSlotEntryId(audio.textId, audio.voiceSlot)
      const proposed = timestamps?.entries[key]
      const retained = oldTiming.success ? oldTiming.data.entries[key] : undefined
      const oldAudio = old.success ? old.data.entries.find((entry) => voiceSlotEntryId(entry.textId, entry.voiceSlot) === key) : undefined
      if (proposed && (proposed.audioHash ? proposed.audioHash === audio.audioHash : oldAudio?.fileName === audio.fileName)) entries[key] = { ...proposed, audioHash: audio.audioHash }
      else if ((!timestamps || timestamps.failed?.some((failure) => voiceSlotEntryId(failure.textId, failure.voiceSlot) === key)) && retained && (retained.audioHash && retained.audioHash === audio.audioHash || oldAudio?.fileName === audio.fileName)) entries[key] = retained
    }
    let timingVersion = timestampRow?.version ?? null
    const nextTiming = { entries, generatedAt: timestamps?.generatedAt ?? new Date().toISOString(), ...(timestamps?.failed?.length ? { failed: timestamps.failed } : {}) }
    if (!equal(oldTiming.success ? oldTiming.data.entries : {}, entries) || !equal(oldTiming.success ? oldTiming.data.failed : undefined, timestamps?.failed)) {
      timingVersion = storage.putNodeData("tts-timestamps", language, nextTiming)
    }
    const next = { ...output, timingVersion }
    if (old.success && equal(old.data.entries, next.entries) && equal(old.data.failed, next.failed) && old.data.timingVersion === timingVersion) return previous!.version
    return storage.putNodeData("tts", language, next)
  })
}

/** Restore physical audio and its paired timing pointer without cache access.
 * Legacy versions without a pairing can restore audio but cannot invent the
 * timing association that older releases did not record. */
export function restoreSpeechOutput(storage: Storage, bookDir: string, language: string, version: number): boolean {
  const versions = storage.getAllNodeVersions("tts", language)
  const requested = versions.find((item) => item.version === version)
  if (!requested) return false
  const snapshot = versions.find((item) => TTSOutput.safeParse(item.data).success && (item.data as TTSOutput).legacySnapshotOf === version)
  const row = snapshot ?? requested
  const output = TTSOutput.parse(row.data)
  if (output.entries.some((entry) => !entry.audioHash)) throw new Error("This legacy version has no verified physical snapshot. Its current content has been preserved.")
  for (const entry of output.entries) verifyAudio(bookDir, language, entry)
  if (output.timingVersion != null && !storage.getAllNodeVersions("tts-timestamps", language).some((item) => item.version === output.timingVersion)) throw new Error("Historical timing version is unavailable")
  return storage.transaction(() => {
    if (output.timingVersion != null) storage.setCurrentNodeVersion("tts-timestamps", language, output.timingVersion)
    else storage.putNodeData("tts-timestamps", language, { entries: {}, generatedAt: new Date().toISOString() })
    return storage.setCurrentNodeVersion("tts", language, row.version)
  })
}

export function publishSpeechTimings(storage: Storage, language: string, timestamps: WordTimestampOutput): number {
  const output = TTSOutput.parse(storage.getLatestNodeData("tts", language)?.data)
  return publishSpeechOutput(storage, language, output, timestamps)
}
