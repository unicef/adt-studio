export interface SpeechSynthesisRequest {
  text: string
  voice: string
  /** Lowercase container/codec name, validated against declared formats. */
  format: string
  /** Free-text style steering; ignored by backends without the capability. */
  instructions?: string
  temperature?: number
  seed?: number
  sampleRate?: number
  bitRate?: string
  signal?: AbortSignal
}

export interface SpeechResult {
  audio: Uint8Array
  format: string
  mimeType: string
}

export interface SpeechSynthesizer {
  synthesize(request: SpeechSynthesisRequest): Promise<SpeechResult>
}

export interface WordTimestamp {
  word: string
  start: number
  end: number
}

export interface TranscriptionRequest {
  audio: Buffer
  fileName: string
  /** BCP-47/ISO hint. Backends may ignore or retry without it. */
  language?: string
  prompt?: string
  wordTimestamps?: boolean
  signal?: AbortSignal
}

export interface TranscriptionResult {
  text: string
  words: WordTimestamp[]
  durationSeconds: number
}

export interface Transcriber {
  transcribe(request: TranscriptionRequest): Promise<TranscriptionResult>
}
