export interface SynthesizeSpeechOptions {
  model: string
  voice: string
  input: string
  responseFormat: string
  instructions?: string
}

export interface TTSSynthesizer {
  synthesize(options: SynthesizeSpeechOptions): Promise<Uint8Array>
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
