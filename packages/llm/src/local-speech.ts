import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import * as ort from "onnxruntime-node"
import { phonemize as espeakPhonemize } from "phonemizer"
import { LocalTTSModelManifest } from "@adt/types"
import type { LocalTTSModelManifest as LocalHfModelManifest } from "@adt/types"
import type { SynthesizeSpeechOptions, TTSSynthesizer } from "./speech.js"
import {
  clearMlxKokoroProcesses,
  getMlxKokoroProcess,
  isMlxKokoroAvailable,
} from "./local-speech-mlx.js"

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
/** `wasm` is accepted for backward compatibility with projects created before native ONNX shipped. */
export type LocalHfTTSDevice = "auto" | "cpu" | "coreml" | "mlx" | "wasm"

export interface LocalHfTTSConfig {
  adapter?: LocalHfTTSAdapter
  modelsDir: string
  /** Directory containing the optional native Apple speech sidecar. */
  runtimeDir?: string
  dtype?: LocalHfTTSDtype
  device?: LocalHfTTSDevice
  speed?: number
  /** Maximum concurrent ONNX inference calls. Auto-sized when omitted. */
  parallelism?: number
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
interface SynthesisLimiter { active: number; limit: number; waiters: Array<() => void> }
const synthesisLimiters = new Map<string, SynthesisLimiter>()

async function withSynthesisSlot<T>(key: string, limit: number, task: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  let limiter = synthesisLimiters.get(key)
  if (!limiter) {
    limiter = { active: 0, limit, waiters: [] }
    synthesisLimiters.set(key, limiter)
  }
  if (limiter.active >= limiter.limit) {
    await new Promise<void>((resolve, reject) => {
      const onAbort = () => {
        const index = limiter!.waiters.indexOf(onReady)
        if (index >= 0) limiter!.waiters.splice(index, 1)
        reject(new DOMException("The operation was aborted", "AbortError"))
      }
      const onReady = () => {
        signal?.removeEventListener("abort", onAbort)
        resolve()
      }
      signal?.addEventListener("abort", onAbort, { once: true })
      limiter!.waiters.push(onReady)
    })
  }
  else limiter.active++
  try {
    signal?.throwIfAborted()
    return await task()
  } finally {
    const next = limiter.waiters.shift()
    if (next) next()
    else limiter.active--
    if (limiter.active === 0 && limiter.waiters.length === 0) synthesisLimiters.delete(key)
  }
}

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

function decodePcm16Wav(bytes: Uint8Array): Float32Array {
  if (bytes.byteLength < 44) throw new Error("Kokoro returned a truncated WAV file")
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (view.getUint16(20, true) !== 1 || view.getUint16(22, true) !== 1 || view.getUint16(34, true) !== 16) {
    throw new Error("Kokoro returned an unsupported WAV format")
  }
  const samples = new Float32Array((bytes.byteLength - 44) / 2)
  for (let index = 0; index < samples.length; index++) {
    samples[index] = view.getInt16(44 + index * 2, true) / 32_768
  }
  return samples
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

function resolveExecutionProvider(device: LocalHfTTSDevice): "cpu" | "coreml" {
  if (device === "mlx") throw new Error("MLX is only available with a downloaded Kokoro MLX model")
  if (device === "cpu" || device === "wasm") return "cpu"
  const hasCoreMl = ort.listSupportedBackends().some((backend) => backend.name === "coreml" && backend.bundled)
  if (device === "coreml") {
    if (!hasCoreMl) throw new Error("Core ML is not available in this ONNX Runtime build")
    return "coreml"
  }
  // Kokoro's current graph only partially partitions to Core ML and benchmarks
  // slower than the CPU EP on Apple Silicon. Keep it opt-in until that changes.
  return "cpu"
}

async function loadRuntime(
  modelsDir: string,
  repository: string,
  parallelism: number,
  device: LocalHfTTSDevice,
): Promise<LocalRuntime> {
  const modelDir = localHfModelDirectory(modelsDir, repository)
  const manifest = readLocalHfManifest(modelsDir, repository)
  const tokenizerJson = JSON.parse(fs.readFileSync(path.join(modelDir, "tokenizer.json"), "utf8")) as {
    model?: { vocab?: Record<string, number> }
  }
  if (!tokenizerJson.model?.vocab) throw new Error("Unsupported Kokoro tokenizer")
  const configuredThreads = Number.parseInt(process.env.LOCAL_TTS_THREADS ?? "", 10)
  const threadCount = Number.isInteger(configuredThreads) && configuredThreads > 0
    ? Math.min(configuredThreads, os.availableParallelism())
    : Math.max(1, Math.floor(os.availableParallelism() / parallelism))
  const modelPath = path.join(modelDir, manifest.modelFile)
  const executionProvider = resolveExecutionProvider(device)
  const session = await ort.InferenceSession.create(
    modelPath,
    { executionProviders: [executionProvider, "cpu"], intraOpNumThreads: threadCount },
  )
  return { manifest, tokenizer: tokenizerJson.model.vocab, session, modelDir }
}

function runtimeCacheKey(modelsDir: string, repository: string, parallelism: number, device: LocalHfTTSDevice): string {
  return `${localHfModelDirectory(modelsDir, repository)}::${device}::p${parallelism}`
}

function getRuntime(modelsDir: string, repository: string, parallelism: number, device: LocalHfTTSDevice): Promise<LocalRuntime> {
  const key = runtimeCacheKey(modelsDir, repository, parallelism, device)
  let promise = runtimePromises.get(key)
  if (!promise) {
    promise = loadRuntime(modelsDir, repository, parallelism, device).catch((error) => { runtimePromises.delete(key); throw error })
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
  const configuredParallelism = Number.parseInt(process.env.LOCAL_TTS_PARALLEL ?? "", 10)
  const device = config.device ?? "auto"
  const autoParallelism = device === "mlx" || resolveExecutionProvider(device) === "coreml"
    ? 1
    : Math.max(1, Math.min(2, Math.floor(os.availableParallelism() / 3)))
  const parallelism = Math.max(1, Math.min(8,
    config.parallelism ?? (Number.isInteger(configuredParallelism) && configuredParallelism > 0
      ? configuredParallelism
      : autoParallelism)))
  const resolved = { adapter: "kokoro", dtype: "q8", speed: 1, ...config, device, parallelism } as const
  if (resolved.adapter !== "kokoro") throw new Error(`Unsupported local TTS adapter: ${resolved.adapter}`)
  fs.mkdirSync(path.resolve(resolved.modelsDir), { recursive: true })

  async function prepare(modelSource: string, signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted()
    const repository = normalizeHfModelSource(modelSource)
    const manifest = readLocalHfManifest(resolved.modelsDir, repository)
    if (manifest.runtime === "mlx") {
      if (!isMlxKokoroAvailable(resolved.runtimeDir)) throw new Error("Kokoro MLX requires Apple Silicon, macOS 15+, and the native app runtime")
      await getMlxKokoroProcess({
        runtimeDir: resolved.runtimeDir,
        modelsDir: resolved.modelsDir,
        modelDir: localHfModelDirectory(resolved.modelsDir, repository),
      })
    } else {
      await getRuntime(resolved.modelsDir, repository, resolved.parallelism, resolved.device)
    }
    signal?.throwIfAborted()
  }

  return {
    prepare,
    async synthesize(options: SynthesizeSpeechOptions): Promise<Uint8Array> {
      if (options.responseFormat.toLowerCase() !== "wav") throw new Error("Local Kokoro TTS outputs WAV audio only")
      if (!isKokoroLanguageSupported(options.language)) throw new Error(`Local Kokoro TTS does not support ${options.language}`)
      const repository = normalizeHfModelSource(options.model)
      const manifest = readLocalHfManifest(resolved.modelsDir, repository)
      if (manifest.runtime === "mlx") {
        if (resolved.device !== "auto" && resolved.device !== "mlx") {
          throw new Error(`Kokoro MLX cannot use the ${resolved.device} execution provider`)
        }
        if (!isMlxKokoroAvailable(resolved.runtimeDir)) throw new Error("Kokoro MLX requires Apple Silicon, macOS 15+, and the native app runtime")
        const modelDir = localHfModelDirectory(resolved.modelsDir, repository)
        const queueKey = `${modelDir}::mlx`
        return withSynthesisSlot(queueKey, 1, async () => {
          const process = await getMlxKokoroProcess({
            runtimeDir: resolved.runtimeDir,
            modelsDir: resolved.modelsDir,
            modelDir,
          })
          const parts: Float32Array[] = []
          for (const chunk of splitText(options.input)) {
            options.signal?.throwIfAborted()
            const phonemes = await phonemize(chunk, (options.voice || DEFAULT_KOKORO_VOICE).startsWith("b"))
            const wav = await process.synthesize({
              phonemes,
              voice: options.voice || DEFAULT_KOKORO_VOICE,
              speed: resolved.speed,
              signal: options.signal,
            })
            parts.push(decodePcm16Wav(wav))
          }
          return encodePcm16Wav(concatenateWithSilence(parts), SAMPLE_RATE)
        }, options.signal)
      }
      let runtime = await getRuntime(resolved.modelsDir, repository, resolved.parallelism, resolved.device)
      const voice = options.voice || DEFAULT_KOKORO_VOICE
      if (!runtime.manifest.voices.includes(voice)) throw new Error(`Voice ${voice} is not installed`)
      const queueKey = runtimeCacheKey(resolved.modelsDir, repository, resolved.parallelism, resolved.device)
      return withSynthesisSlot(queueKey, resolved.parallelism, async () => {
        const run = async (activeRuntime: LocalRuntime): Promise<Uint8Array> => {
          options.signal?.throwIfAborted()
          const parts: Float32Array[] = []
          for (const chunk of splitText(options.input)) {
            options.signal?.throwIfAborted()
            parts.push(await synthesizeChunk(activeRuntime, chunk, voice, resolved.speed))
          }
          return encodePcm16Wav(concatenateWithSilence(parts), SAMPLE_RATE)
        }
        try {
          return await run(runtime)
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          if (!/no available backend|fetch failed/i.test(message)) throw error
          // A failed ONNX backend remains poisoned for later cache misses.
          // Recreate the session once; retrying the same session cannot recover.
          runtimePromises.delete(queueKey)
          // Another permitted inference may still be using this shared session.
          // Remove it from the cache, but let GC release it after active callers
          // finish instead of invalidating their native ONNX handle mid-run.
          runtime = await getRuntime(resolved.modelsDir, repository, resolved.parallelism, resolved.device)
          return await run(runtime)
        }
      }, options.signal)
    },
  }
}

export function clearLocalHfTTSRuntimeCache(): void {
  runtimePromises.clear(); synthesisLimiters.clear(); clearMlxKokoroProcesses()
}
