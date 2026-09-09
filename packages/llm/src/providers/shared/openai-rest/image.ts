import type { ImageCapabilities } from "@adt/types"
import { AiProviderError } from "../../../ports/errors.js"
import type {
  ImageBackend,
  ImageEditRequest,
  ImageGenerateRequest,
  ImageResult,
} from "../../../ports/image-backend.js"

const DEFAULT_TIMEOUT_MS = 180_000
const MAX_REFERENCE_BYTES = 25 * 1024 * 1024

export interface OpenAiImageBackendOptions {
  providerId: string
  modelId: string
  apiKey: string
  /** Base URL including the API version segment, e.g. `https://api.openai.com/v1`. */
  baseUrl: string
  capabilities: ImageCapabilities
}

/**
 * Direct fetch instead of @ai-sdk/openai: that SDK auto-injects
 * `response_format: "b64_json"` for any model outside its hardcoded
 * `hasDefaultResponseFormat` set, and the API rejects that parameter for newer
 * gpt-image-* variants ("Unknown parameter: 'response_format'").
 */
export function createOpenAiImageBackend(
  options: OpenAiImageBackendOptions,
): ImageBackend {
  const { providerId, modelId, capabilities } = options

  const assertSize = (size?: string): void => {
    if (!size) return
    if (capabilities.sizes.length > 0 && !capabilities.sizes.includes(size)) {
      throw AiProviderError.unsupportedCapability(
        providerId,
        "image",
        `size ${size} (supported: ${capabilities.sizes.join(", ")})`,
        modelId,
      )
    }
  }

  const backend: ImageBackend = {
    async generate(request: ImageGenerateRequest): Promise<ImageResult> {
      if (!capabilities.generate) {
        throw AiProviderError.unsupportedCapability(providerId, "image", "generate", modelId)
      }
      assertSize(request.size)

      const body: Record<string, unknown> = {
        model: modelId,
        prompt: request.prompt,
        output_format: "png",
      }
      if (request.size) body.size = request.size

      return call(options, "generations", JSON.stringify(body), true, signalFor(request))
    },
  }

  if (capabilities.edit) {
    backend.edit = async (request: ImageEditRequest): Promise<ImageResult> => {
      assertSize(request.size)

      const max = capabilities.maxReferenceImages
      if (max !== undefined && request.referenceImages.length > max) {
        throw AiProviderError.unsupportedCapability(
          providerId,
          "image",
          `${request.referenceImages.length} reference images (max ${max})`,
          modelId,
        )
      }

      const allowedMime = capabilities.mimeTypes
      let totalBytes = 0
      const formData = new FormData()
      formData.append("model", modelId)
      formData.append("prompt", request.prompt)
      if (request.size) formData.append("size", request.size)
      formData.append("output_format", "png")

      for (const [index, image] of request.referenceImages.entries()) {
        const mimeType = image.mimeType ?? "image/png"
        if (allowedMime.length > 0 && !allowedMime.includes(mimeType)) {
          throw AiProviderError.unsupportedCapability(
            providerId,
            "image",
            `reference mime type ${mimeType} (supported: ${allowedMime.join(", ")})`,
            modelId,
          )
        }
        totalBytes += image.data.byteLength
        if (totalBytes > MAX_REFERENCE_BYTES) {
          throw new Error(
            `Reference images exceed the ${Math.round(MAX_REFERENCE_BYTES / 1024 / 1024)}MB request limit`,
          )
        }
        formData.append(
          "image",
          new Blob([image.data], { type: mimeType }),
          image.name ?? `reference-${index + 1}.png`,
        )
      }

      return call(options, "edits", formData, false, signalFor(request))
    }
  }

  return backend
}

function signalFor(request: ImageGenerateRequest): AbortSignal | undefined {
  const timeoutMs = request.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const timeout = timeoutMs > 0 ? AbortSignal.timeout(timeoutMs) : undefined
  if (timeout && request.signal) return AbortSignal.any([timeout, request.signal])
  return timeout ?? request.signal
}

async function call(
  options: OpenAiImageBackendOptions,
  endpoint: "generations" | "edits",
  body: string | FormData,
  jsonBody: boolean,
  signal?: AbortSignal,
): Promise<ImageResult> {
  const headers: Record<string, string> = {}
  if (options.apiKey) headers.Authorization = `Bearer ${options.apiKey}`
  if (jsonBody) headers["Content-Type"] = "application/json"

  const response = await fetch(`${options.baseUrl.replace(/\/$/, "")}/images/${endpoint}`, {
    method: "POST",
    headers,
    body,
    signal,
  })

  const text = await response.text()
  if (!response.ok) {
    throw new Error(parseApiError(text, response.status))
  }

  const data = JSON.parse(text) as { data?: Array<{ b64_json?: string }> }
  const base64 = data.data?.[0]?.b64_json
  if (!base64) {
    throw new Error("No image data returned by the image endpoint")
  }

  return { base64, mimeType: "image/png" }
}

function parseApiError(body: string, status: number): string {
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } }
    return parsed.error?.message ?? `Image API error: ${status}`
  } catch {
    return `Image API error: ${status}`
  }
}
