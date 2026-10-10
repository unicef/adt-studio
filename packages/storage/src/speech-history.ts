import { storeImmutableAsset } from "./immutable-assets.js"
import fs from "node:fs"
import path from "node:path"
import { createHash } from "node:crypto"
import { TTSOutput, WordTimestampOutput, voiceSlotEntryId, type SpeechFileEntry } from "@adt/types"
import type { Storage } from "./storage.js"

function equal(a: unknown, b: unknown) { return JSON.stringify(a) === JSON.stringify(b) }

function verifyAudio(bookDir: string, language: string, entry: SpeechFileEntry): Buffer {
  if (!/^[a-zA-Z0-9_-]+$/.test(language) || path.basename(entry.fileName) !== entry.fileName) throw new Error("Invalid audio path")
  const root = fs.realpathSync(bookDir)
  const file = fs.realpathSync(path.join(root, "audio", language, entry.fileName))
  const relative = path.relative(root, file)
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Audio path escapes book")
  const bytes = fs.readFileSync(file)
  if (!bytes.length || entry.audioHash && createHash("sha256").update(bytes).digest("hex") !== entry.audioHash) throw new Error("Audio asset is missing or changed")
  return bytes
}

function copyRetainedAudio(bookDir: string, from: string, to: string, entry: SpeechFileEntry): SpeechFileEntry {
  const bytes = verifyAudio(bookDir, from, entry)
  const asset = storeImmutableAsset(bookDir, ["audio", to], voiceSlotEntryId(entry.textId, entry.voiceSlot), path.extname(entry.fileName).slice(1), bytes)
  return { ...entry, fileName: asset.fileName, audioHash: asset.contentHash }
}

/** Publish a paired manifest. Unmatched old timings remain historical but can
 * never be served alongside different audio. Caller holds book admission. */
export function publishSpeechOutput(storage: Storage, language: string, output: TTSOutput, timestamps?: WordTimestampOutput): number {
  return storage.transaction(() => {
    // Readers accept underscore locale keys. Preserve their current physical
    // state and timing pair before the first write creates a normalized key.
    const legacyLanguage = language.replace("-", "_")
    const legacyRow = legacyLanguage !== language && !storage.getLatestNodeData("tts", language)
      ? storage.getLatestNodeData("tts", legacyLanguage) : null
    const legacy = TTSOutput.safeParse(legacyRow?.data)
    if (legacy.success && storage.bookDir) {
      publishSpeechOutput(storage, legacyLanguage, legacy.data)
      const retained = TTSOutput.parse(storage.getLatestNodeData("tts", legacyLanguage)!.data)
      const entries = retained.entries.map((entry) => {
        try { verifyAudio(storage.bookDir!, legacyLanguage, entry) }
        catch { return entry } // An already-missing file cannot block other entries.
        return copyRetainedAudio(storage.bookDir!, legacyLanguage, language, entry)
      })
      const legacyTiming = WordTimestampOutput.safeParse(storage.getLatestNodeData("tts-timestamps", legacyLanguage)?.data)
      const timingVersion = legacyTiming.success ? storage.putNodeData("tts-timestamps", language, legacyTiming.data) : null
      storage.putNodeData("tts", language, { ...retained, entries, timingVersion, legacySnapshotOf: undefined })
      const replacements = new Map(legacy.data.entries.map((entry, index) => [voiceSlotEntryId(entry.textId, entry.voiceSlot), { previous: entry, retained: entries[index] }]))
      output = { ...output, entries: output.entries.map((entry) => {
        const replacement = replacements.get(voiceSlotEntryId(entry.textId, entry.voiceSlot))
        return replacement?.previous.fileName === entry.fileName && replacement.retained.audioHash && (!entry.audioHash || entry.audioHash === replacement.retained.audioHash)
          ? { ...entry, fileName: replacement.retained.fileName, audioHash: replacement.retained.audioHash } : entry
      }) }
    }
    const previous = storage.getLatestNodeData("tts", language)
    const old = TTSOutput.safeParse(previous?.data)
    const timestampRow = storage.getLatestNodeData("tts-timestamps", language)
    const oldTiming = WordTimestampOutput.safeParse(timestampRow?.data)
    let snapshotted = false
    if (old.success && previous && storage.bookDir && old.data.entries.some((entry) => !entry.audioHash)) {
      const snapshots = old.data.entries.map((entry) => {
        try { verifyAudio(storage.bookDir!, language, entry) } catch { return entry }
        return copyRetainedAudio(storage.bookDir!, language, language, entry)
      })
      snapshotted = snapshots.some((entry, index) => entry.fileName !== old.data.entries[index].fileName)
      if (snapshotted) storage.putNodeData("tts", language, { ...old.data, entries: snapshots, timingVersion: timestampRow?.version ?? null, legacySnapshotOf: previous.version })
      const verified = new Map(old.data.entries.map((entry, index) => [entry.fileName, snapshots[index]]))
      output = { ...output, entries: output.entries.map((entry) => {
        const snapshot = !entry.audioHash ? verified.get(entry.fileName) : undefined
        return snapshot?.audioHash ? { ...entry, fileName: snapshot.fileName, audioHash: snapshot.audioHash } : entry
      }) }
      // The bytes are unchanged: keep their matching legacy timings even
      // though the active filename is now immutable.
      old.data.entries = snapshots
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
    const timingFailures = timestamps ? timestamps.failed : oldTiming.success ? oldTiming.data.failed : undefined
    const nextTiming = { entries, generatedAt: timestamps?.generatedAt ?? new Date().toISOString(), ...(timingFailures?.length ? { failed: timingFailures } : {}) }
    if (!equal(oldTiming.success ? oldTiming.data.entries : {}, entries) || !equal(oldTiming.success ? oldTiming.data.failed : undefined, timingFailures)) {
      timingVersion = storage.putNodeData("tts-timestamps", language, nextTiming)
    }
    const next = { ...output, timingVersion }
    if (!snapshotted && old.success && equal(old.data.entries, next.entries) && equal(old.data.failed, next.failed) && old.data.timingVersion === timingVersion) return previous!.version
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
    const restored = storage.setCurrentNodeVersion("tts", language, row.version)
    const normalized = language.replace("_", "-")
    if (normalized !== language && storage.getLatestNodeData("tts", normalized)) {
      const entries = output.entries.map((entry) => copyRetainedAudio(bookDir, language, normalized, entry))
      const paired = WordTimestampOutput.parse(storage.getLatestNodeData("tts-timestamps", language)?.data)
      const audioById = new Map(entries.map((entry) => [voiceSlotEntryId(entry.textId, entry.voiceSlot), entry]))
      const timing = { ...paired, entries: Object.fromEntries(Object.entries(paired.entries).map(([key, entry]) => [key, {
        ...entry, audioHash: entry.audioHash ?? audioById.get(key)?.audioHash,
      }])) }
      publishSpeechOutput(storage, normalized, { ...output, entries, legacySnapshotOf: undefined }, timing)
    }
    return restored
  })
}

export function publishSpeechTimings(storage: Storage, language: string, timestamps: WordTimestampOutput): number {
  const output = TTSOutput.parse(storage.getLatestNodeData("tts", language)?.data)
  return publishSpeechOutput(storage, language, output, timestamps)
}
