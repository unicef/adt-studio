import { GOOGLE_IMAGE_MODELS, GoogleImageResponse, type ImageCapabilities } from "@adt/types"
import { imageDimensions } from "../../log.js"
import { AiProviderError } from "../../ports/errors.js"
import type { ImageBackend, ImageGenerateRequest, ImageReference, ImageResult } from "../../ports/image-backend.js"
import { detectImageMediaType } from "../shared/image-media-type.js"

const ASPECT_RATIOS: Record<string, string> = {
  "1024x1024": "1:1",
  "1536x1024": "3:2",
  "1024x1536": "2:3",
}

export function isGoogleImageModel(modelId: string): boolean {
  return Object.hasOwn(GOOGLE_IMAGE_MODELS, modelId)
}

export function googleImageCapabilities(modelId: string): ImageCapabilities {
  if (!isGoogleImageModel(modelId)) {
    throw AiProviderError.unsupportedCapability("google", "image", "image model", modelId)
  }
  return {
    generate: true,
    edit: true,
    sizes: Object.keys(ASPECT_RATIOS),
    mimeTypes: ["image/png", "image/jpeg", "image/webp"],
    maxReferenceImages: GOOGLE_IMAGE_MODELS[modelId as keyof typeof GOOGLE_IMAGE_MODELS],
  }
}

/** Native Gemini image generation/editing, without an SDK or server-side session. */
export function createGoogleImageBackend(modelId: string, apiKey: string): ImageBackend {
  const capabilities = googleImageCapabilities(modelId)

  const call = async (
    request: ImageGenerateRequest,
    references: ImageReference[] = [],
  ): Promise<ImageResult> => {
    if (request.size && !Object.hasOwn(ASPECT_RATIOS, request.size)) {
      throw AiProviderError.unsupportedCapability("google", "image", `size ${request.size}`, modelId)
    }
    if (references.length > capabilities.maxReferenceImages!) {
      throw AiProviderError.unsupportedCapability("google", "image", `${references.length} reference images`, modelId)
    }
    const input = [
      { type: "text", text: request.prompt },
      ...references.map((image) => {
        const data = image.data.toString("base64")
        const mime_type = image.mimeType ?? detectImageMediaType(data)
        if (!capabilities.mimeTypes.includes(mime_type)) {
          throw AiProviderError.unsupportedCapability("google", "image", `reference type ${mime_type}`, modelId)
        }
        return { type: "image", mime_type, data }
      }),
    ]
    // Bound inline requests, including the prompt and base64 encoding overhead.
    const body = JSON.stringify({
      model: modelId,
      input,
      store: false,
      response_format: {
        type: "image",
        mime_type: "image/png",
        ...(request.size ? { aspect_ratio: ASPECT_RATIOS[request.size] } : {}),
      },
    })
    if (Buffer.byteLength(body) > 20 * 1024 * 1024) {
      throw new Error("Google image request exceeds the 20 MB inline request limit")
    }
    const timeoutMs = request.timeoutMs ?? 180_000
    const timeout = timeoutMs > 0 ? AbortSignal.timeout(timeoutMs) : undefined
    const signal = timeout && request.signal ? AbortSignal.any([timeout, request.signal]) : timeout ?? request.signal
    signal?.throwIfAborted()
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body,
      signal,
    })
    if (!response.ok) {
      // Never relay a provider body that could echo the submitted credential.
      const hint = response.status === 401 || response.status === 403
        ? "Check the Google API key and model access."
        : response.status === 429 ? "Check the Google quota or retry later." : "Retry or check Google model availability."
      throw new Error(`Google image request failed (HTTP ${response.status}). ${hint}`)
    }
    const payload: unknown = await response.json().catch(() => null)
    signal?.throwIfAborted()
    const parsed = GoogleImageResponse.safeParse(payload)
    if (!parsed.success) throw new Error("Google returned an invalid image response")
    if (parsed.data.status !== "completed") throw new Error("Google image generation did not complete")

    // Thought images are not final output. Match the API's output_image helper:
    // use the last image in model_output steps, ignoring text and thinking steps.
    const output = parsed.data.steps
      .filter((step) => step.type === "model_output")
      .flatMap((step) => step.content ?? [])
      .filter((part) => part.type === "image")
      .at(-1)
    if (!output?.data) throw new Error("Google returned no final image; the request may have been blocked")
    const buffer = Buffer.from(output.data, "base64")
    const { width, height } = imageDimensions(output.data)
    if (
      output.mime_type !== "image/png" ||
      buffer.toString("base64") !== output.data ||
      buffer.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a" ||
      buffer.subarray(-12).toString("hex") !== "0000000049454e44ae426082" ||
      !width || !height
    ) {
      throw new Error("Google returned invalid PNG image data")
    }
    return { base64: output.data, mimeType: "image/png" }
  }

  return {
    generate: (request) => call(request),
    edit: (request) => call(request, request.referenceImages),
  }
}
