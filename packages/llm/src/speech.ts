import { DEFAULT_ELEVENLABS_VOICE_SETTINGS } from "@adt/types"

/**
 * ElevenLabs `voice_settings` overrides, in our camelCase option naming.
 * Named separately so the pipeline options, the TTS cache key, and the
 * config→options mapping can all share one field list instead of restating
 * five fields each.
 */
export interface ElevenLabsVoiceSettingsOverrides {
  elevenLabsStability?: number
  elevenLabsSimilarityBoost?: number
  elevenLabsStyle?: number
  elevenLabsUseSpeakerBoost?: boolean
  elevenLabsSpeed?: number
}

export interface SynthesizeSpeechOptions extends ElevenLabsVoiceSettingsOverrides {
  model: string
  voice: string
  input: string
  responseFormat: string
  instructions?: string
  /**
   * Gemini sampling controls. Lower `temperature` → less prosodic variance
   * between the independent per-sentence requests; fixed `seed` → reproducible
   * delivery. Ignored by the OpenAI/Azure synthesizers. When omitted, neither
   * is sent and Gemini uses its own defaults (i.e. sampling is disabled).
   */
  temperature?: number
  seed?: number
  /**
   * ElevenLabs-only continuity + normalization controls. Ignored by the
   * OpenAI/Azure/Gemini synthesizers. Each catalog entry is synthesized in
   * its own request, so without adjacent-text context ElevenLabs has no
   * knowledge of what came before/after and tone can reset at entry
   * boundaries. `elevenLabsApplyTextNormalization` mirrors the Gemini
   * sampling opt-in pattern: omitted → ElevenLabs uses its own default.
   */
  elevenLabsPreviousText?: string
  elevenLabsNextText?: string
  elevenLabsApplyTextNormalization?: "auto" | "on" | "off"
  /** Aborts the in-flight HTTP request (run cancellation). */
  signal?: AbortSignal
}

/** The wire shape of ElevenLabs' `voice_settings` request field. */
export interface ElevenLabsVoiceSettings {
  stability: number
  similarity_boost: number
  style: number
  use_speaker_boost: boolean
  speed?: number
}

/**
 * Merge {@link DEFAULT_ELEVENLABS_VOICE_SETTINGS} with any explicit overrides.
 *
 * Exported because the TTS cache key must hash the *effective* settings, not
 * just the user's overrides — otherwise changing the defaults in a future
 * release would silently reuse audio generated under the old ones. The request
 * body and the cache key must both derive from this one function.
 *
 * `speed` is only present when explicitly set, so unset leaves ElevenLabs'
 * own pacing alone rather than pinning it to 1.0.
 */
export function resolveElevenLabsVoiceSettings(
  options: ElevenLabsVoiceSettingsOverrides
): ElevenLabsVoiceSettings {
  return {
    stability: options.elevenLabsStability ?? DEFAULT_ELEVENLABS_VOICE_SETTINGS.stability,
    similarity_boost:
      options.elevenLabsSimilarityBoost ?? DEFAULT_ELEVENLABS_VOICE_SETTINGS.similarity_boost,
    style: options.elevenLabsStyle ?? DEFAULT_ELEVENLABS_VOICE_SETTINGS.style,
    use_speaker_boost:
      options.elevenLabsUseSpeakerBoost ?? DEFAULT_ELEVENLABS_VOICE_SETTINGS.use_speaker_boost,
    ...(options.elevenLabsSpeed !== undefined ? { speed: options.elevenLabsSpeed } : {}),
  }
}

export interface TTSSynthesizer {
  synthesize(options: SynthesizeSpeechOptions): Promise<Uint8Array>
}

export interface WhisperWordTimestamp {
  word: string
  start: number
  end: number
}

export interface WhisperTranscriptionResult {
  text: string
  words: WhisperWordTimestamp[]
  duration: number
}

/**
 * Transcribe an audio file using OpenAI Whisper with word-level timestamps.
 *
 * The `language` parameter is only an accuracy hint, but OpenAI's hosted
 * transcription API rejects ISO codes outside its supported set with a 400
 * (e.g. Albanian "sq") even though the underlying model can transcribe them.
 * When that happens we retry once without the hint so auto-detection takes
 * over, rather than hard-failing every item in that language.
 */
export async function transcribeWithWhisper(
  audioBuffer: Buffer,
  fileName: string,
  apiKey: string,
  language?: string,
  prompt?: string,
): Promise<WhisperTranscriptionResult> {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "mp3"
  const mimeType =
    ext === "wav" ? "audio/wav"
      : ext === "ogg" ? "audio/ogg"
        : "audio/mpeg"

  const postTranscription = (withLanguage: boolean): Promise<Response> => {
    const blob = new Blob([audioBuffer], { type: mimeType })
    const form = new FormData()
    form.append("file", blob, fileName)
    form.append("model", "whisper-1")
    form.append("response_format", "verbose_json")
    form.append("timestamp_granularities[]", "word")
    if (withLanguage && language) form.append("language", language)
    if (prompt) form.append("prompt", prompt)

    return fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: form,
    })
  }

  let response = await postTranscription(Boolean(language))

  // A 400 while a language hint is set is almost always the hint being
  // rejected (unsupported ISO code). Retry once without it before giving up;
  // a genuine non-language 400 (e.g. bad audio) simply fails again and the
  // real message is surfaced below.
  if (!response.ok && response.status === 400 && language) {
    const firstError = await response.text()
    response = await postTranscription(false)
    if (!response.ok) {
      const message = await response.text()
      throw new Error(
        `Whisper transcription failed (${response.status}): ${message || firstError || response.statusText}`
      )
    }
  } else if (!response.ok) {
    const message = await response.text()
    throw new Error(
      `Whisper transcription failed (${response.status}): ${message || response.statusText}`
    )
  }

  const data = await response.json() as {
    text?: string
    duration?: number
    words?: Array<{ word: string; start: number; end: number }>
  }

  return {
    text: data.text ?? "",
    words: (data.words ?? []).map((w) => ({
      word: w.word,
      start: w.start,
      end: w.end,
    })),
    duration: data.duration ?? 0,
  }
}

/**
 * Create a minimal TTS client using OpenAI's speech endpoint.
 * API key defaults to OPENAI_API_KEY if omitted.
 */
export interface AzureTTSConfig {
  subscriptionKey: string
  region: string
}

export interface AzureAudioOptions {
  sampleRate?: number
  bitRate?: string
}

export interface GeminiTTSConfig {
  apiKey?: string
}

export interface ElevenLabsTTSConfig {
  apiKey?: string
}

/** Mirrors `AzureAudioOptions`: generic `speech.sample_rate`/`bit_rate` config
 *  applied to the ElevenLabs synthesizer. Unlike Azure/OpenAI, ElevenLabs only
 *  accepts a fixed set of (sample rate, bitrate) combinations per output
 *  format, so these are snapped to the nearest supported value rather than
 *  passed through verbatim. */
export interface ElevenLabsAudioOptions {
  sampleRate?: number
  bitRate?: string
}

interface GeminiInlineData {
  data?: string
  mimeType?: string
}

interface GeminiGenerateContentPayload {
  error?: { message?: string } | string
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string
        inlineData?: GeminiInlineData
      }>
    }
  }>
}

const GEMINI_PCM_SAMPLE_RATE = 24_000
const GEMINI_PCM_CHANNELS = 1
const GEMINI_PCM_BITS_PER_SAMPLE = 16

// ElevenLabs returns raw PCM (16-bit signed, mono) at this rate when the
// `pcm_24000` output format is requested; we wrap it as WAV ourselves (mirrors
// the Gemini PCM handling) since ElevenLabs has no native "wav" output format.
const ELEVENLABS_PCM_SAMPLE_RATE = 24_000

// ElevenLabs' valid `output_format` combinations (per their TTS API docs).
// Each container constrains sample rate — and, for mp3/opus, bitrate — to a
// fixed set of values, so arbitrary `speech.sample_rate`/`bit_rate` config
// must be snapped to the nearest supported combination rather than passed
// through as-is (contrast with Azure, whose REST API accepts free-form values).
const ELEVENLABS_MP3_SAMPLE_RATES = [22050, 44100]
const ELEVENLABS_MP3_BITRATES_BY_SAMPLE_RATE: Record<number, number[]> = {
  22050: [32],
  44100: [32, 64, 96, 128, 192],
}
const ELEVENLABS_PCM_SAMPLE_RATES = [8000, 16000, 22050, 24000, 44100]
const ELEVENLABS_OPUS_SAMPLE_RATE = 48_000
const ELEVENLABS_OPUS_BITRATES = [32, 64, 96, 128, 192]

function nearestValue(candidates: number[], target: number): number {
  return candidates.reduce((best, candidate) =>
    Math.abs(candidate - target) < Math.abs(best - target) ? candidate : best
  )
}

/** Extracts a kbps number from a generic `bit_rate` config string (e.g. "128",
 *  "128k", or Azure's own "128kbitrate" token) so the same config value can
 *  drive both providers. Returns undefined when no digits are present. */
function parseKbps(bitRate?: string): number | undefined {
  if (!bitRate) return undefined
  const match = /\d+/.exec(bitRate)
  return match ? Number(match[0]) : undefined
}

function resolveElevenLabsPcmSampleRate(sampleRate?: number): number {
  return sampleRate !== undefined
    ? nearestValue(ELEVENLABS_PCM_SAMPLE_RATES, sampleRate)
    : ELEVENLABS_PCM_SAMPLE_RATE
}

function buildAzureOutputFormat(
  format: string,
  sampleRate?: number,
  bitRate?: string
): string {
  const srKhz = Math.round((sampleRate ?? 24000) / 1000)
  const br = bitRate ?? "48kbitrate"
  if (format.toLowerCase() === "opus") {
    return `ogg-${srKhz}khz-16bit-mono-opus`
  }
  return `audio-${srKhz}khz-${br}-mono-mp3`
}

function buildSSML(voice: string, text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
  return `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'><voice name='${voice}'>${escaped}</voice></speak>`
}

function wrapPcmAsWave(
  pcmBytes: Uint8Array,
  sampleRate = GEMINI_PCM_SAMPLE_RATE,
  channels = GEMINI_PCM_CHANNELS,
  bitsPerSample = GEMINI_PCM_BITS_PER_SAMPLE
): Uint8Array {
  const header = Buffer.alloc(44)
  const byteRate = sampleRate * channels * (bitsPerSample / 8)
  const blockAlign = channels * (bitsPerSample / 8)
  const dataSize = pcmBytes.byteLength

  header.write("RIFF", 0)
  header.writeUInt32LE(36 + dataSize, 4)
  header.write("WAVE", 8)
  header.write("fmt ", 12)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(channels, 22)
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(byteRate, 28)
  header.writeUInt16LE(blockAlign, 32)
  header.writeUInt16LE(bitsPerSample, 34)
  header.write("data", 36)
  header.writeUInt32LE(dataSize, 40)

  return new Uint8Array(Buffer.concat([header, Buffer.from(pcmBytes)]))
}

function extractGeminiAudioData(
  payload: GeminiGenerateContentPayload
): string | null {
  let fallbackAudioData: string | null = null

  for (const candidate of payload.candidates ?? []) {
    for (const part of candidate.content?.parts ?? []) {
      const inlineData = part.inlineData
      if (!inlineData?.data) continue

      const mimeType = inlineData.mimeType?.toLowerCase()
      if (mimeType?.startsWith("audio/")) {
        return inlineData.data
      }

      if (!mimeType && !fallbackAudioData) {
        fallbackAudioData = inlineData.data
      }
    }
  }

  return fallbackAudioData
}

function summarizeGeminiResponse(
  payload: GeminiGenerateContentPayload
): string | null {
  const details: string[] = []

  for (const candidate of payload.candidates ?? []) {
    for (const part of candidate.content?.parts ?? []) {
      const text = part.text?.trim()
      if (text) {
        details.push(`text="${text.slice(0, 160)}"`)
        continue
      }

      const mimeType = part.inlineData?.mimeType?.trim()
      if (mimeType) {
        details.push(`inlineData mimeType=${mimeType}`)
      } else if (part.inlineData?.data) {
        details.push("inlineData without mimeType")
      }
    }
  }

  if (details.length === 0) {
    return null
  }

  return details.slice(0, 3).join("; ")
}

function buildGeminiShortTextRetryInput(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null

  const codePointLength = Array.from(trimmed).length
  if (codePointLength > 10) return null
  if (/[.!?؟۔。！？।]$/u.test(trimmed)) return null

  const suffix =
    /[\u0600-\u08FF]/u.test(trimmed) ? "۔"
      : /[\u0900-\u097F]/u.test(trimmed) ? "।"
        : /[\u3040-\u30FF\u3400-\u9FFF]/u.test(trimmed) ? "。"
          : "."

  return `${trimmed}${suffix}`
}

/**
 * Wrap transcript text in the structured "performance + transcript" layout the
 * native Gemini TTS models use for accent/style steering.
 *
 * The newer native speech models (e.g. gemini-*-tts-preview) reject the
 * `systemInstruction` field at the API schema level ("Developer instruction is
 * not enabled for this model"), so steering must live inside the prompt text.
 * The `#### TRANSCRIPT` delimiter keeps the performance notes from being spoken
 * aloud — only the text below it is read. Returns the transcript unchanged when
 * there are no instructions, preserving the bare-text behaviour.
 */
function buildGeminiSpeechPrompt(transcript: string, instructions?: string): string {
  const performance = instructions?.trim()
  if (!performance) return transcript
  return `### PERFORMANCE\n${performance}\n\n#### TRANSCRIPT\n${transcript}`
}

/**
 * Create a TTS client using Azure Speech Services REST API.
 */
export function createAzureTTSSynthesizer(
  config: AzureTTSConfig,
  audioOptions?: AzureAudioOptions
): TTSSynthesizer {
  return {
    async synthesize(options: SynthesizeSpeechOptions): Promise<Uint8Array> {
      const outputFormat = buildAzureOutputFormat(
        options.responseFormat,
        audioOptions?.sampleRate,
        audioOptions?.bitRate
      )
      const ssml = buildSSML(options.voice, options.input)
      const url = `https://${config.region}.tts.speech.microsoft.com/cognitiveservices/v1`

      console.log(`[azure-tts] POST ${url} voice=${options.voice} format=${outputFormat} text=${options.input.slice(0, 60)}...`)

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Ocp-Apim-Subscription-Key": config.subscriptionKey,
          "Content-Type": "application/ssml+xml",
          "X-Microsoft-OutputFormat": outputFormat,
        },
        body: ssml,
        signal: options.signal,
      })
      if (!response.ok) {
        const message = await response.text()
        const errorMsg = `Azure TTS request failed (${response.status}): ${message || response.statusText}`
        console.error(`[azure-tts] ${errorMsg}`)
        throw new Error(errorMsg)
      }

      const arrayBuffer = await response.arrayBuffer()
      console.log(`[azure-tts] OK ${arrayBuffer.byteLength} bytes`)
      return new Uint8Array(arrayBuffer)
    },
  }
}

/**
 * Create a minimal TTS client using OpenAI's speech endpoint.
 * API key defaults to OPENAI_API_KEY if omitted.
 */
export function createTTSSynthesizer(apiKey?: string): TTSSynthesizer {
  return {
    async synthesize(options: SynthesizeSpeechOptions): Promise<Uint8Array> {
      const resolvedApiKey = apiKey ?? process.env.OPENAI_API_KEY
      if (!resolvedApiKey) {
        throw new Error("OPENAI_API_KEY is required for TTS synthesis")
      }

      const response = await fetch("https://api.openai.com/v1/audio/speech", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resolvedApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: options.model,
          voice: options.voice,
          input: options.input,
          response_format: options.responseFormat,
          instructions: options.instructions,
        }),
        signal: options.signal,
      })
      if (!response.ok) {
        const message = await response.text()
        throw new Error(
          `TTS request failed (${response.status}): ${message || response.statusText}`
        )
      }

      const arrayBuffer = await response.arrayBuffer()
      return new Uint8Array(arrayBuffer)
    },
  }
}

/**
 * Create a Gemini TTS client using the Gemini generateContent endpoint.
 * API key defaults to GEMINI_API_KEY if omitted.
 */
export function createGeminiTTSSynthesizer(
  config?: GeminiTTSConfig
): TTSSynthesizer {
  return {
    async synthesize(options: SynthesizeSpeechOptions): Promise<Uint8Array> {
      const resolvedApiKey = config?.apiKey ?? process.env.GEMINI_API_KEY
      if (!resolvedApiKey) {
        throw new Error("GEMINI_API_KEY is required for Gemini TTS synthesis")
      }

      const outputFormat = options.responseFormat.toLowerCase()
      if (outputFormat !== "wav" && outputFormat !== "pcm") {
        throw new Error(
          `Gemini TTS only supports wav output in this integration. Received: ${options.responseFormat}`
        )
      }

      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(options.model)}:generateContent`
      const synthesizeInput = async (transcript: string): Promise<GeminiGenerateContentPayload> => {
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": resolvedApiKey,
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: buildGeminiSpeechPrompt(transcript, options.instructions),
                  },
                ],
              },
            ],
            generationConfig: {
              responseModalities: ["AUDIO"],
              // Sampling is opt-in per book (SpeechConfig temperature/seed).
              // Only send each param when set; when unset we send neither so
              // Gemini uses its own defaults. Pinning a low temperature + fixed
              // seed keeps tone consistent across the per-sentence requests.
              ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
              ...(options.seed !== undefined ? { seed: options.seed } : {}),
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: {
                    voiceName: options.voice,
                  },
                },
              },
            },
          }),
          signal: options.signal,
        })

        const responseText = await response.text()
        const payload = (() => {
          try {
            return JSON.parse(responseText)
          } catch {
            return { error: responseText || response.statusText }
          }
        })() as GeminiGenerateContentPayload

        if (!response.ok) {
          const message =
            typeof payload.error === "string" ? payload.error
              : payload.error?.message ?? response.statusText
          throw new Error(
            `Gemini TTS request failed (${response.status}): ${message || response.statusText}`
          )
        }

        return payload
      }

      let payload = await synthesizeInput(options.input)
      let audioData = extractGeminiAudioData(payload)

      if (!audioData) {
        const retryInput = buildGeminiShortTextRetryInput(options.input)
        if (retryInput) {
          payload = await synthesizeInput(retryInput)
          audioData = extractGeminiAudioData(payload)
        }
      }

      if (!audioData) {
        const responseSummary = summarizeGeminiResponse(payload)
        throw new Error(
          responseSummary
            ? `Gemini TTS response did not include audio data. Response summary: ${responseSummary}`
            : "Gemini TTS response did not include audio data"
        )
      }

      const pcmBytes = new Uint8Array(Buffer.from(audioData, "base64"))
      return outputFormat === "pcm" ? pcmBytes : wrapPcmAsWave(pcmBytes)
    },
  }
}

/**
 * Map our generic `responseFormat` (plus optional `speech.sample_rate`/
 * `bit_rate` config) to an ElevenLabs `output_format` query value. ElevenLabs
 * has no native "wav" format, so wav/pcm requests ask for raw PCM at the
 * resolved sample rate and get wrapped as WAV locally (mirrors the Gemini
 * handling). Unset `audioOptions` reproduce the previous hardcoded defaults.
 *
 * Throws on anything else. The caller derives the audio file's *extension*
 * from the same `format` value, so silently falling back to mp3 here would
 * write mp3 bytes into e.g. a `.ogg` file — a corrupt bundle that only shows
 * up at playback time. `resolveSpeechFormat` passes `speech.format` through
 * unvalidated for every non-Gemini provider, so this is the only place that
 * knows the supported set.
 */
export function buildElevenLabsOutputFormat(
  format: string,
  audioOptions?: ElevenLabsAudioOptions
): string {
  const normalized = format.toLowerCase()
  const requestedKbps = parseKbps(audioOptions?.bitRate)

  if (normalized === "opus") {
    const bitrate = requestedKbps !== undefined
      ? nearestValue(ELEVENLABS_OPUS_BITRATES, requestedKbps)
      : 128
    return `opus_${ELEVENLABS_OPUS_SAMPLE_RATE}_${bitrate}`
  }
  if (normalized === "wav" || normalized === "pcm") {
    return `pcm_${resolveElevenLabsPcmSampleRate(audioOptions?.sampleRate)}`
  }
  if (normalized !== "mp3") {
    throw new Error(
      `ElevenLabs TTS does not support the "${format}" audio format (supported: mp3, opus, wav, pcm)`
    )
  }

  const sampleRate = audioOptions?.sampleRate !== undefined
    ? nearestValue(ELEVENLABS_MP3_SAMPLE_RATES, audioOptions.sampleRate)
    : 44100
  const allowedBitrates = ELEVENLABS_MP3_BITRATES_BY_SAMPLE_RATE[sampleRate]
  const defaultBitrate = sampleRate === 44100 ? 128 : 32
  const bitrate = requestedKbps !== undefined
    ? nearestValue(allowedBitrates, requestedKbps)
    : defaultBitrate
  return `mp3_${sampleRate}_${bitrate}`
}

/** ElevenLabs models whose text normalization is gated behind an Enterprise
 *  plan — the v2.5 family disables it by default to keep latency low. */
const ELEVENLABS_ENTERPRISE_NORMALIZATION_MODELS = new Set([
  "eleven_turbo_v2_5",
  "eleven_flash_v2_5",
])

/**
 * Append an actionable hint to an upstream ElevenLabs error when we can infer
 * the cause from the request we sent. Without this, "request failed (400)" plus
 * a terse upstream body reads as a generic outage rather than a config problem
 * the user can fix.
 */
function elevenLabsErrorHint(
  status: number,
  message: string,
  options: SynthesizeSpeechOptions
): string {
  if (
    status === 400 &&
    options.elevenLabsApplyTextNormalization &&
    options.elevenLabsApplyTextNormalization !== "off" &&
    ELEVENLABS_ENTERPRISE_NORMALIZATION_MODELS.has(options.model) &&
    /normalization/i.test(message)
  ) {
    return (
      ` — text normalization on ${options.model} requires an ElevenLabs Enterprise plan.` +
      ` Set Text Normalization to "Off", or switch to eleven_multilingual_v2, which normalizes numbers better anyway.`
    )
  }
  return ""
}

/**
 * Create a TTS client using the ElevenLabs text-to-speech REST API.
 * API key defaults to ELEVENLABS_API_KEY if omitted. `voice` must be an
 * ElevenLabs voice ID (not a human-readable voice name) — resolved the same
 * way as the other providers via `voices.yaml` / `speech.voice`.
 */
export function createElevenLabsTTSSynthesizer(
  config?: ElevenLabsTTSConfig,
  audioOptions?: ElevenLabsAudioOptions
): TTSSynthesizer {
  return {
    async synthesize(options: SynthesizeSpeechOptions): Promise<Uint8Array> {
      const resolvedApiKey = config?.apiKey ?? process.env.ELEVENLABS_API_KEY
      if (!resolvedApiKey) {
        throw new Error("ELEVENLABS_API_KEY is required for ElevenLabs TTS synthesis")
      }

      const normalizedFormat = options.responseFormat.toLowerCase()
      const outputFormat = buildElevenLabsOutputFormat(normalizedFormat, audioOptions)
      const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(options.voice)}?output_format=${outputFormat}`

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "xi-api-key": resolvedApiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: options.input,
          model_id: options.model,
          // Always sent — an absent `voice_settings` hands control to the
          // voice's stored dashboard settings, which is what lets community
          // voices inject filler sounds. See resolveElevenLabsVoiceSettings.
          voice_settings: resolveElevenLabsVoiceSettings(options),
          ...(options.elevenLabsPreviousText
            ? { previous_text: options.elevenLabsPreviousText }
            : {}),
          ...(options.elevenLabsNextText
            ? { next_text: options.elevenLabsNextText }
            : {}),
          ...(options.elevenLabsApplyTextNormalization
            ? { apply_text_normalization: options.elevenLabsApplyTextNormalization }
            : {}),
        }),
        signal: options.signal,
      })
      if (!response.ok) {
        const message = await response.text()
        throw new Error(
          `ElevenLabs TTS request failed (${response.status}): ${message || response.statusText}` +
            elevenLabsErrorHint(response.status, message, options)
        )
      }

      const arrayBuffer = await response.arrayBuffer()
      const bytes = new Uint8Array(arrayBuffer)
      return normalizedFormat === "wav"
        ? wrapPcmAsWave(bytes, resolveElevenLabsPcmSampleRate(audioOptions?.sampleRate))
        : bytes
    },
  }
}
