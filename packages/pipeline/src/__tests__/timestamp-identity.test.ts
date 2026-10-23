import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import crypto from "node:crypto"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { storeImmutableAsset } from "@adt/storage"
import { generateWordTimestamps } from "../speech.js"

let root: string
const transport = vi.fn<typeof fetch>()
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "timestamp-identity-"))
  transport.mockReset().mockImplementation(async (url) => {
    expect(String(url)).toBe("https://api.openai.com/v1/audio/transcriptions")
    return Response.json({ text: "Hello", words: [{ word: "Hello", start: 0, end: 1 }], duration: 1 })
  })
  vi.stubGlobal("fetch", transport)
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); fs.rmSync(root, { recursive: true, force: true }) })

function observeBinaryHashes() {
  const buffers: Uint8Array[] = []
  const create = crypto.createHash
  vi.spyOn(crypto, "createHash").mockImplementation((...args) => {
    const hash = create(...args)
    const update = hash.update.bind(hash)
    hash.update = ((value: Parameters<typeof hash.update>[0], ...rest: [BufferEncoding?]) => {
      if (ArrayBuffer.isView(value)) buffers.push(value as Uint8Array)
      return update(value, ...rest as [BufferEncoding])
    }) as typeof hash.update
    return hash
  })
  return buffers
}

it("uses the recorded immutable identity on misses and hits, preserving the existing cache key", async () => {
  const bytes = Buffer.from("first audio")
  const asset = storeImmutableAsset(root, ["audio", "en"], "text", "mp3", bytes)
  const options = { audioBuffer: fs.readFileSync(path.join(root, "audio", "en", asset.fileName)), fileName: asset.fileName,
    audioHash: asset.contentHash, apiKey: "stub", language: "en", prompt: "Hello", cacheDir: path.join(root, ".cache") }
  const key = crypto.createHash("sha256").update(JSON.stringify({ audioHash: asset.contentHash, language: "en", prompt: "Hello", model: "whisper-1" })).digest("hex")
  const hashed = observeBinaryHashes()
  expect(await generateWordTimestamps(options)).toMatchObject({ cached: false, audioHash: asset.contentHash })
  expect(await generateWordTimestamps(options)).toMatchObject({ cached: true, audioHash: asset.contentHash })
  expect(fs.existsSync(path.join(root, ".cache", "word-timestamps", `${key}.json`))).toBe(true)
  expect(transport).toHaveBeenCalledTimes(1)
  expect(hashed).toHaveLength(0)
})

it("separates changed audio identities and changed text/language at the actual transport boundary", async () => {
  const first = storeImmutableAsset(root, ["audio", "en"], "text", "mp3", Buffer.from("first"))
  const second = storeImmutableAsset(root, ["audio", "en"], "text", "mp3", Buffer.from("second"))
  const options = { audioBuffer: Buffer.from("first"), fileName: first.fileName, audioHash: first.contentHash,
    apiKey: "stub", language: "en", prompt: "Hello", cacheDir: root }
  const hashed = observeBinaryHashes()
  await generateWordTimestamps(options)
  await generateWordTimestamps({ ...options, audioBuffer: Buffer.from("second"), fileName: second.fileName, audioHash: second.contentHash })
  await generateWordTimestamps({ ...options, prompt: "Updated" })
  await generateWordTimestamps({ ...options, language: "fr" })
  await generateWordTimestamps(options)
  expect(transport).toHaveBeenCalledTimes(4)
  expect(hashed).toHaveLength(0)
})

it("derives unrecorded audio identity once and lets its caller reuse it without rehashing", async () => {
  const audioBuffer = Buffer.from("legacy audio")
  const expected = crypto.createHash("sha256").update(audioBuffer).digest("hex")
  const hashed = observeBinaryHashes()
  const options = { audioBuffer, fileName: "legacy.mp3", apiKey: "stub", cacheDir: root }
  const result = await generateWordTimestamps(options)
  expect(result.audioHash).toBe(expected)
  expect(await generateWordTimestamps({ ...options, audioHash: result.audioHash })).toMatchObject({ cached: true, audioHash: expected })
  expect(hashed).toHaveLength(1)
  expect(transport).toHaveBeenCalledTimes(1)
})

it("does not cache a failed transcription and retries the same identity without media hashing", async () => {
  transport.mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
  const hashed = observeBinaryHashes()
  const options = { audioBuffer: Buffer.from("audio"), audioHash: "recorded-write-identity", fileName: "audio.mp3", apiKey: "stub", cacheDir: root }
  await expect(generateWordTimestamps(options)).rejects.toThrow("503")
  expect(await generateWordTimestamps(options)).toMatchObject({ cached: false, audioHash: options.audioHash })
  expect(await generateWordTimestamps(options)).toMatchObject({ cached: true })
  expect(transport).toHaveBeenCalledTimes(2)
  expect(hashed).toHaveLength(0)
})
