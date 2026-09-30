import type { SttCapabilities, TtsCapabilities } from "@adt/types"
import { AiProviderError } from "../../../ports/errors.js"
import { createTTSSynthesizer } from "../../../speech.js"
import type {
  SpeechResult,
  SpeechSynthesisRequest,
  SpeechSynthesizer,
  Transcriber,
  TranscriptionRequest,
  TranscriptionResult,
} from "../../../ports/speech-backend.js"

export const AUDIO_MIME_TYPES: Record<string, string> = {
  mp3: "audio/mpeg",
  opus: "audio/ogg",
  aac: "audio/aac",
  flac: "audio/flac",
  wav: "audio/wav",
  pcm: "audio/L16",
}

export function audioMimeType(format: string): string {
  return AUDIO_MIME_TYPES[format.toLowerCase()] ?? "application/octet-stream"
}

export function assertFormatSupported(
  providerId: string,
  modelId: string,
  format: string,
  capabilities: { formats: string[] },
): void {
  if (!capabilities.formats.includes(format.toLowerCase())) {
    throw AiProviderError.unsupportedCapability(
      providerId,
      "tts",
      `format ${format} (supported: ${capabilities.formats.join(", ")})`,
      modelId,
    )
  }
}

export interface OpenAiSpeechOptions {
  providerId: string
  modelId: string
  apiKey: string
  baseUrl: string
  capabilities: TtsCapabilities
}

/**
 * Adapts the legacy `TTSSynthesizer` the speech pipeline still constructs
 * directly, so the OpenAI speech REST call lives in exactly one place.
 */
export function createOpenAiSpeechSynthesizer(
  options: OpenAiSpeechOptions,
): SpeechSynthesizer {
  return {
    async synthesize(request: SpeechSynthesisRequest): Promise<SpeechResult> {
      const format = request.format.toLowerCase()
      assertFormatSupported(options.providerId, options.modelId, format, options.capabilities)

      const audio = await createTTSSynthesizer(options.apiKey, options.baseUrl).synthesize({
        model: options.modelId,
        voice: request.voice,
        input: request.text,
        responseFormat: format,
        ...(options.capabilities.instructions && request.instructions
          ? { instructions: request.instructions }
          : {}),
        ...(request.signal ? { signal: request.signal } : {}),
      })

      return { audio, format, mimeType: audioMimeType(format) }
    },
  }
}

export interface OpenAiTranscriberOptions {
  providerId: string
  modelId: string
  apiKey: string
  baseUrl: string
  capabilities: SttCapabilities
}

/**
 * The `language` parameter is only an accuracy hint, but the hosted API rejects
 * ISO codes outside its supported set with a 400 (e.g. Albanian "sq") even
 * though the model can transcribe them. When that happens we retry once without
 * the hint so auto-detection takes over, rather than hard-failing every item in
 * that language.
 */
export function createOpenAiTranscriber(options: OpenAiTranscriberOptions): Transcriber {
  return {
    async transcribe(request: TranscriptionRequest): Promise<TranscriptionResult> {
      const ext = request.fileName.split(".").pop()?.toLowerCase() ?? "mp3"
      if (!options.capabilities.inputFormats.includes(ext)) {
        throw AiProviderError.unsupportedCapability(
          options.providerId,
          "stt",
          `input format .${ext} (supported: ${options.capabilities.inputFormats.join(", ")})`,
          options.modelId,
        )
      }
      const wantsWords = request.wordTimestamps !== false
      if (wantsWords && !options.capabilities.wordTimestamps) {
        throw AiProviderError.unsupportedCapability(
          options.providerId,
          "stt",
          "word timestamps",
          options.modelId,
        )
      }

      const mimeType =
        ext === "wav" ? "audio/wav" : ext === "ogg" ? "audio/ogg" : "audio/mpeg"

      const post = (withLanguage: boolean): Promise<Response> => {
        const form = new FormData()
        form.append("file", new Blob([request.audio], { type: mimeType }), request.fileName)
        form.append("model", options.modelId)
        form.append("response_format", "verbose_json")
        if (wantsWords) form.append("timestamp_granularities[]", "word")
        if (withLanguage && request.language && options.capabilities.languageHint) {
          form.append("language", request.language)
        }
        if (request.prompt) form.append("prompt", request.prompt)

        return fetch(`${trimSlash(options.baseUrl)}/audio/transcriptions`, {
          method: "POST",
          headers: { Authorization: `Bearer ${options.apiKey}` },
          body: form,
          signal: request.signal,
        })
      }

      let response = await post(Boolean(request.language))

      if (!response.ok && response.status === 400 && request.language) {
        const firstError = await response.text()
        response = await post(false)
        if (!response.ok) {
          const message = await response.text()
          throw new Error(
            `Transcription failed (${response.status}): ${message || firstError || response.statusText}`,
          )
        }
      } else if (!response.ok) {
        const message = await response.text()
        throw new Error(
          `Transcription failed (${response.status}): ${message || response.statusText}`,
        )
      }

      const data = (await response.json()) as {
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
        durationSeconds: data.duration ?? 0,
      }
    },
  }
}

function trimSlash(value: string): string {
  return value.replace(/\/$/, "")
}
