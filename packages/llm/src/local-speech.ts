import fs from "node:fs"
import path from "node:path"
import * as ort from "onnxruntime-web/wasm"
import { phonemize as espeakPhonemize } from "phonemizer"
import { LocalTTSModelManifest } from "@adt/types"
import type { LocalTTSModelManifest as LocalHfModelManifest } from "@adt/types"
import type { SynthesizeSpeechOptions, TTSSynthesizer } from "./speech.js"

export type { LocalHfModelManifest }

export const DEFAULT_KOKORO_MODEL = "onnx-community/Kokoro-82M-v1.0-ONNX"
export const DEFAULT_KOKORO_VOICE = "af_heart"
export const KOKORO_SUPPORTED_LANGUAGES = ["en", "en-US", "en-GB"] as const
export const KOKORO_VOICES = [
  "af_heart", "af_bella", "af_nicole", "af_sarah", "af_sky",
  "am_adam", "am_michael", "am_puck", "bf_emma", "bf_isabella",
  "bm_george", "bm_lewis",
] as const

export type LocalHfTTSAdapter = "kokoro"
export type LocalHfTTSDtype = "q8" | "q4" | "fp32" | "fp16" | "q4f16"
export type LocalHfTTSDevice = "wasm"

export interface LocalHfTTSConfig {
  adapter?: LocalHfTTSAdapter
  modelsDir: string
  dtype?: LocalHfTTSDtype
  device?: LocalHfTTSDevice
  speed?: number
}

export interface LocalHfTTSSynthesizer extends TTSSynthesizer {
  prepare(modelSource: string, signal?: AbortSignal): Promise<void>
}

interface LocalRuntime {
  manifest: LocalHfModelManifest
  tokenizer: Readonly<Record<string, number>>
  session: ort.InferenceSession
  modelDir: string
}

const STYLE_DIM = 256
const SAMPLE_RATE = 24_000
const MAX_PHONEME_TOKENS = 500
const runtimePromises = new Map<string, Promise<LocalRuntime>>()
const synthesisQueues = new Map<string, Promise<void>>()

/** Accepts `org/model`, `hf:org/model`, or a huggingface.co model URL. */
export function normalizeHfModelSource(source: string): string {
  const value = source.trim()
  if (!value) throw new Error("A Hugging Face model repository is required")
  let candidate = value.startsWith("hf:") ? value.slice(3) : value
  if (/^https?:\/\//i.test(candidate)) {
    const url = new URL(candidate)
    if (!["huggingface.co", "www.huggingface.co"].includes(url.hostname)) {
      throw new Error("Only huggingface.co model URLs are supported")
    }
    const segments = url.pathname.split("/").filter(Boolean)
    if (segments.length < 2) throw new Error("Invalid Hugging Face model URL")
    candidate = `${segments[0]}/${segments[1]}`
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/.test(candidate)) {
    throw new Error("Invalid Hugging Face model repository; expected owner/model")
  }
  return candidate
}

export function localHfModelDirectory(modelsDir: string, repository: string): string {
  return path.join(path.resolve(modelsDir), normalizeHfModelSource(repository).replace("/", "--"))
}

export function isKokoroLanguageSupported(language?: string): boolean {
  return !language || language.trim().toLowerCase().split(/[-_]/)[0] === "en"
}

export function readLocalHfManifest(modelsDir: string, repository: string): LocalHfModelManifest {
  const manifestPath = path.join(localHfModelDirectory(modelsDir, repository), "manifest.json")
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Local TTS model ${repository} is not installed. Download it in Settings > Local AI.`)
  }
  return LocalTTSModelManifest.parse(JSON.parse(fs.readFileSync(manifestPath, "utf8")))
}

/** Encode canonical PCM16 WAV; ADT's duration parser intentionally rejects float WAV. */
export function encodePcm16Wav(samples: Float32Array, sampleRate: number): Uint8Array {
  const dataSize = samples.length * 2
  const buffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buffer)
  const ascii = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index++) view.setUint8(offset + index, value.charCodeAt(index))
  }
  ascii(0, "RIFF"); view.setUint32(4, 36 + dataSize, true); ascii(8, "WAVE")
  ascii(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true)
  view.setUint16(22, 1, true); view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true)
  ascii(36, "data"); view.setUint32(40, dataSize, true)
  for (let index = 0; index < samples.length; index++) {
    const sample = Number.isFinite(samples[index]) ? Math.max(-1, Math.min(1, samples[index])) : 0
    view.setInt16(44 + index * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true)
  }
  return new Uint8Array(buffer)
}

function normalizeEnglishText(text: string): string {
  return text.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim()
}

async function phonemize(text: string, british: boolean): Promise<string> {
  const result = (await espeakPhonemize(normalizeEnglishText(text), british ? "en" : "en-us")).join(" ")
  return result.replace(/ʲ/g, "j").replace(/r/g, "ɹ").replace(/x/g, "k").replace(/ɬ/g, "l").trim()
}

function splitText(text: string): string[] {
  const sentences = text.match(/[^.!?\n]+(?:[.!?]+|$)/g)?.map((value) => value.trim()).filter(Boolean) ?? [text]
  const chunks: string[] = []
  for (const sentence of sentences) {
    if (sentence.length <= 350) { chunks.push(sentence); continue }
    const words = sentence.split(/\s+/)
    let chunk = ""
    for (const word of words) {
      if (chunk && `${chunk} ${word}`.length > 350) { chunks.push(chunk); chunk = word }
      else chunk = chunk ? `${chunk} ${word}` : word
    }
    if (chunk) chunks.push(chunk)
  }
  return chunks
}

function tokenize(phonemes: string, vocab: Readonly<Record<string, number>>): bigint[] {
  const ids = [0n]
  for (const character of phonemes) {
    const id = vocab[character]
    if (id !== undefined) ids.push(BigInt(id))
  }
  ids.push(0n)
  if (ids.length > MAX_PHONEME_TOKENS + 2) throw new Error("Text chunk exceeds Kokoro's token limit")
  return ids
}

function concatenateWithSilence(parts: Float32Array[]): Float32Array {
  const silenceLength = Math.round(SAMPLE_RATE * 0.08)
  const total = parts.reduce((sum, part) => sum + part.length, 0) + Math.max(0, parts.length - 1) * silenceLength
  const output = new Float32Array(total)
  let offset = 0
  for (const part of parts) { output.set(part, offset); offset += part.length + silenceLength }
  return output
}

async function loadRuntime(modelsDir: string, repository: string): Promise<LocalRuntime> {
  const modelDir = localHfModelDirectory(modelsDir, repository)
  const manifest = readLocalHfManifest(modelsDir, repository)
  const tokenizerJson = JSON.parse(fs.readFileSync(path.join(modelDir, "tokenizer.json"), "utf8")) as {
    model?: { vocab?: Record<string, number> }
  }
  if (!tokenizerJson.model?.vocab) throw new Error("Unsupported Kokoro tokenizer")
  const packagedWasmPath = process.env.LOCAL_TTS_WASM_PATH
  if (packagedWasmPath) {
    if (!fs.existsSync(packagedWasmPath)) throw new Error(`Local TTS WASM runtime is missing: ${packagedWasmPath}`)
    ort.env.wasm.wasmBinary = fs.readFileSync(packagedWasmPath)
  }
  ort.env.wasm.numThreads = 1
  const modelPath = path.join(modelDir, manifest.modelFile)
  const modelBytes = fs.readFileSync(modelPath)
  const session = await ort.InferenceSession.create(
    new Uint8Array(modelBytes.buffer, modelBytes.byteOffset, modelBytes.byteLength),
    { executionProviders: ["wasm"] },
  )
  return { manifest, tokenizer: tokenizerJson.model.vocab, session, modelDir }
}

function getRuntime(modelsDir: string, repository: string): Promise<LocalRuntime> {
  const key = localHfModelDirectory(modelsDir, repository)
  let promise = runtimePromises.get(key)
  if (!promise) {
    promise = loadRuntime(modelsDir, repository).catch((error) => { runtimePromises.delete(key); throw error })
    runtimePromises.set(key, promise)
  }
  return promise
}

async function synthesizeChunk(runtime: LocalRuntime, text: string, voice: string, speed: number): Promise<Float32Array> {
  const british = voice.startsWith("b")
  const ids = tokenize(await phonemize(text, british), runtime.tokenizer)
  const voicePath = path.join(runtime.modelDir, "voices", `${voice}.bin`)
  if (!fs.existsSync(voicePath)) throw new Error(`Voice ${voice} is not installed for this model`)
  const voiceBytes = fs.readFileSync(voicePath)
  const voiceFloats = new Float32Array(voiceBytes.buffer, voiceBytes.byteOffset, Math.floor(voiceBytes.byteLength / 4))
  const tokenCount = Math.min(Math.max(ids.length - 2, 0), 509)
  const style = voiceFloats.slice(tokenCount * STYLE_DIM, (tokenCount + 1) * STYLE_DIM)
  if (style.length !== STYLE_DIM) throw new Error(`Voice ${voice} has an invalid style table`)
  const feeds = {
    input_ids: new ort.Tensor("int64", BigInt64Array.from(ids), [1, ids.length]),
    style: new ort.Tensor("float32", style, [1, STYLE_DIM]),
    speed: new ort.Tensor("float32", Float32Array.of(speed), [1]),
  }
  const result = await runtime.session.run(feeds)
  const waveform = result.waveform?.data
  if (!(waveform instanceof Float32Array)) throw new Error("Kokoro returned an invalid waveform")
  return waveform
}

export function createLocalHfTTSSynthesizer(config: LocalHfTTSConfig): LocalHfTTSSynthesizer {
  const resolved = { adapter: "kokoro", dtype: "q8", device: "wasm", speed: 1, ...config } as const
  if (resolved.adapter !== "kokoro") throw new Error(`Unsupported local TTS adapter: ${resolved.adapter}`)
  fs.mkdirSync(path.resolve(resolved.modelsDir), { recursive: true })

  async function prepare(modelSource: string, signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted(); await getRuntime(resolved.modelsDir, normalizeHfModelSource(modelSource)); signal?.throwIfAborted()
  }

  return {
    prepare,
    async synthesize(options: SynthesizeSpeechOptions): Promise<Uint8Array> {
      if (options.responseFormat.toLowerCase() !== "wav") throw new Error("Local Kokoro TTS outputs WAV audio only")
      if (!isKokoroLanguageSupported(options.language)) throw new Error(`Local Kokoro TTS does not support ${options.language}`)
      const repository = normalizeHfModelSource(options.model)
      const runtime = await getRuntime(resolved.modelsDir, repository)
      const voice = options.voice || DEFAULT_KOKORO_VOICE
      if (!runtime.manifest.voices.includes(voice)) throw new Error(`Voice ${voice} is not installed`)
      const queueKey = runtime.modelDir
      const previous = synthesisQueues.get(queueKey) ?? Promise.resolve()
      let release!: () => void
      const current = new Promise<void>((resolve) => { release = resolve })
      const queued = previous.then(() => current)
      synthesisQueues.set(queueKey, queued)
      await previous
      try {
        options.signal?.throwIfAborted()
        const parts: Float32Array[] = []
        for (const chunk of splitText(options.input)) {
          options.signal?.throwIfAborted()
          parts.push(await synthesizeChunk(runtime, chunk, voice, resolved.speed))
        }
        return encodePcm16Wav(concatenateWithSilence(parts), SAMPLE_RATE)
      } finally {
        release(); if (synthesisQueues.get(queueKey) === queued) synthesisQueues.delete(queueKey)
      }
    },
  }
}

export function clearLocalHfTTSRuntimeCache(): void {
  runtimePromises.clear(); synthesisQueues.clear()
}
