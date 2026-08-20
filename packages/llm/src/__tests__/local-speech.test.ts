import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import {
  encodePcm16Wav,
  isKokoroLanguageSupported,
  localHfModelDirectory,
  normalizeHfModelSource,
  readLocalHfManifest,
} from "../local-speech.js"

const temporaryDirectories: string[] = []
afterEach(() => temporaryDirectories.splice(0).forEach((directory) => fs.rmSync(directory, { recursive: true, force: true })))

describe("local Hugging Face speech", () => {
  it("normalizes repository IDs and Hugging Face URLs", () => {
    expect(normalizeHfModelSource("hf:onnx-community/Kokoro-82M-v1.0-ONNX")).toBe("onnx-community/Kokoro-82M-v1.0-ONNX")
    expect(normalizeHfModelSource("https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/tree/main")).toBe("onnx-community/Kokoro-82M-v1.0-ONNX")
    expect(() => normalizeHfModelSource("https://example.com/model")).toThrow("Only huggingface.co")
    expect(() => normalizeHfModelSource("../model")).toThrow("owner/model")
  })

  it("enforces the current English-only Kokoro capability", () => {
    expect(isKokoroLanguageSupported("en-US")).toBe(true)
    expect(isKokoroLanguageSupported("en_GB")).toBe(true)
    expect(isKokoroLanguageSupported("fr")).toBe(false)
  })

  it("encodes mono 24 kHz PCM16 WAV", () => {
    const wav = encodePcm16Wav(Float32Array.of(-1, 0, 1), 24_000)
    const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength)
    expect(new TextDecoder().decode(wav.slice(0, 4))).toBe("RIFF")
    expect(view.getUint16(20, true)).toBe(1)
    expect(view.getUint16(22, true)).toBe(1)
    expect(view.getUint32(24, true)).toBe(24_000)
    expect(view.getUint16(34, true)).toBe(16)
  })

  it("requires an installed manifest", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "adt-local-speech-test-"))
    temporaryDirectories.push(directory)
    expect(localHfModelDirectory(directory, "owner/model")).toBe(path.join(directory, "owner--model"))
    expect(() => readLocalHfManifest(directory, "owner/model")).toThrow("is not installed")
  })
})
