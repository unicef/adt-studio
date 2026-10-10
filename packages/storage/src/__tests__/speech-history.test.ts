import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { createBookStorage } from "../book-storage.js"
import { storeImmutableAsset } from "../immutable-assets.js"
import { publishSpeechOutput, restoreSpeechOutput } from "../speech-history.js"
import type { SpeechFileEntry, TTSOutput, WordTimestampOutput } from "@adt/types"

let root: string
let storage: ReturnType<typeof createBookStorage>
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), "adt-speech-history-")); storage = createBookStorage("book", root) })
afterEach(() => { storage.close(); fs.rmSync(root, { recursive: true, force: true }) })
function audio(text: string, manual = false): SpeechFileEntry {
  const asset = storeImmutableAsset(storage.bookDir!, ["audio", "fr"], "text", "mp3", Buffer.from(text))
  return { textId: "text", language: "fr", fileName: asset.fileName, audioHash: asset.contentHash, voice: "voice", model: "model", cached: false, source: manual ? "manual" : "ai", provider: manual ? "manual" : "openai" }
}
function timing(entry: SpeechFileEntry, word: string): WordTimestampOutput {
  return { generatedAt: "now", entries: { text: { textId: "text", language: "fr", audioHash: entry.audioHash, words: [{ word, start: 0, end: 1 }], duration: 1 } } }
}

describe("paired physical speech history", () => {
  it("restores generated and uploaded audio with matching timings after cache deletion", () => {
    const generated = audio("generated")
    const first = publishSpeechOutput(storage, "fr", { entries: [generated], generatedAt: "one" }, timing(generated, "one"))
    const uploaded = audio("uploaded", true)
    const second = publishSpeechOutput(storage, "fr", { entries: [uploaded], generatedAt: "two" }, timing(uploaded, "two"))
    fs.mkdirSync(path.join(storage.bookDir!, ".cache"))
    fs.rmSync(path.join(storage.bookDir!, ".cache"), { recursive: true })
    expect(restoreSpeechOutput(storage, storage.bookDir!, "fr", first)).toBe(true)
    expect((storage.getLatestNodeData("tts", "fr")!.data as TTSOutput).entries[0].fileName).toBe(generated.fileName)
    expect((storage.getLatestNodeData("tts-timestamps", "fr")!.data as WordTimestampOutput).entries.text.words[0].word).toBe("one")
    expect(restoreSpeechOutput(storage, storage.bookDir!, "fr", second)).toBe(true)
    expect((storage.getLatestNodeData("tts-timestamps", "fr")!.data as WordTimestampOutput).entries.text.words[0].word).toBe("two")
    expect(fs.readFileSync(path.join(storage.bookDir!, "audio/fr", generated.fileName), "utf8")).toBe("generated")
    expect(fs.readFileSync(path.join(storage.bookDir!, "audio/fr", uploaded.fileName), "utf8")).toBe("uploaded")
  })

  it("rejects a corrupt historical asset without moving either current pointer", () => {
    const firstAudio = audio("first")
    const first = publishSpeechOutput(storage, "fr", { entries: [firstAudio], generatedAt: "one" }, timing(firstAudio, "one"))
    const secondAudio = audio("second")
    publishSpeechOutput(storage, "fr", { entries: [secondAudio], generatedAt: "two" }, timing(secondAudio, "two"))
    const before = storage.getNodeVersionFingerprint()
    fs.writeFileSync(path.join(storage.bookDir!, "audio/fr", firstAudio.fileName), "corrupt")
    expect(() => restoreSpeechOutput(storage, storage.bookDir!, "fr", first)).toThrow("missing or changed")
    expect(storage.getNodeVersionFingerprint()).toEqual(before)
  })

  it("rolls back active manifests when publication fails after producing new bytes", () => {
    const original = audio("first")
    publishSpeechOutput(storage, "fr", { entries: [original], generatedAt: "one" }, timing(original, "one"))
    const before = storage.getNodeVersionFingerprint()
    const replacement = audio("second")
    expect(() => storage.transaction(() => { publishSpeechOutput(storage, "fr", { entries: [replacement], generatedAt: "two" }, timing(replacement, "two")); throw new Error("injected failure") })).toThrow("injected failure")
    expect(storage.getNodeVersionFingerprint()).toEqual(before)
    expect(fs.readFileSync(path.join(storage.bookDir!, "audio/fr", original.fileName), "utf8")).toBe("first")
  })

  it("snapshots the surviving legacy bytes before their first replacement", () => {
    fs.mkdirSync(path.join(storage.bookDir!, "audio/fr"), { recursive: true })
    fs.writeFileSync(path.join(storage.bookDir!, "audio/fr/text.mp3"), "legacy")
    const old: SpeechFileEntry = { textId: "text", language: "fr", fileName: "text.mp3", voice: "voice", model: "model", cached: false }
    const legacyVersion = storage.putNodeData("tts", "fr", { entries: [old], generatedAt: "legacy" })
    storage.putNodeData("tts-timestamps", "fr", timing(old, "legacy"))
    const next = audio("next")
    publishSpeechOutput(storage, "fr", { entries: [next], generatedAt: "next" }, timing(next, "next"))
    fs.rmSync(path.join(storage.bookDir!, "audio/fr/text.mp3"))
    expect(restoreSpeechOutput(storage, storage.bookDir!, "fr", legacyVersion)).toBe(true)
    const restored = (storage.getLatestNodeData("tts", "fr")!.data as TTSOutput).entries[0]
    expect(fs.readFileSync(path.join(storage.bookDir!, "audio/fr", restored.fileName), "utf8")).toBe("legacy")
    expect(restored.source).toBeUndefined()
  })
})
