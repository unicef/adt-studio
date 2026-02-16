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
