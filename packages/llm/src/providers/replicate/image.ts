import { setTimeout as delay } from "node:timers/promises"
import { BACKGROUND_REMOVER_VERSION, ReplicatePrediction } from "@adt/types"
import type { ImageBackend } from "../../ports/image-backend.js"
import { AiProviderError } from "../../ports/errors.js"
import { detectImageMediaType } from "../shared/image-media-type.js"

const PREDICTIONS_URL = "https://api.replicate.com/v1/predictions"
const MAX_IMAGE_BYTES = 20 * 1024 * 1024

/** Never echo provider bodies, signed delivery URLs, or tokens into errors/logs. */
async function fetchChecked(url: string, init: RequestInit): Promise<Response> {
  let response: Response
  try { response = await fetch(url, { ...init, redirect: "error" }) }
  catch {
    init.signal?.throwIfAborted()
    throw new Error("Could not reach Replicate")
  }
  if (!response.ok) {
    await response.body?.cancel()
    throw new Error(`Replicate request failed with HTTP ${response.status}`)
  }
  return response
}

async function readBounded(response: Response, limit: number): Promise<Buffer> {
  const reader = response.body?.getReader()
  if (!reader) throw new Error("Replicate returned an empty response")
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    if (Number(response.headers.get("content-length")) > limit) throw new Error("Replicate response exceeds the size limit")
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > limit) throw new Error("Replicate response exceeds the size limit")
      chunks.push(value)
    }
    return Buffer.concat(chunks)
  } finally { await reader.cancel().catch(() => {}) }
}

async function prediction(response: Response): Promise<ReplicatePrediction> {
  const bytes = await readBounded(response, 2 * 1024 * 1024)
  try { return ReplicatePrediction.parse(JSON.parse(bytes.toString())) }
  catch { throw new Error("Replicate returned an invalid prediction") }
}

function deliveryUrl(output: string | null | undefined): string {
  let url: URL
  try { url = new URL(output ?? "") } catch { throw new Error("Replicate returned no output image") }
  if (url.protocol !== "https:" || url.username || url.password || url.port ||
      !(url.hostname === "replicate.delivery" || url.hostname.endsWith(".replicate.delivery"))) {
    throw new Error("Replicate returned an unsupported output location")
  }
  return url.toString()
}

/** Pinned 851-labs model: RGBA PNG with soft alpha, using Replicate's prediction API. */
export function createReplicateBackgroundBackend(apiKey: string): ImageBackend {
  return {
    generate: async () => { throw AiProviderError.unsupportedCapability("replicate", "image", "generate") },
    edit: async (request) => {
      if (request.referenceImages.length !== 1 || request.size || request.aspectRatio !== undefined) {
        throw AiProviderError.unsupportedCapability("replicate", "image", "one source image at its original size")
      }
      const image = request.referenceImages[0]
      const mimeType = detectImageMediaType(image.data.toString("base64"))
      if (!["image/png", "image/jpeg"].includes(mimeType) || (image.mimeType && image.mimeType !== mimeType)) {
        throw AiProviderError.unsupportedCapability("replicate", "image", "PNG or JPEG input")
      }
      if (image.data.length > 5 * 1024 * 1024) throw new Error("Background removal accepts images up to 5 MB")
      const timeoutMs = request.timeoutMs ?? 180_000
      const signal = AbortSignal.any([...(request.signal ? [request.signal] : []), AbortSignal.timeout(timeoutMs)])
      signal.throwIfAborted()
      const headers = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }
      let activeId: string | undefined
      try {
        let result = await prediction(await fetchChecked(PREDICTIONS_URL, {
          method: "POST", signal,
          headers: { ...headers, Prefer: "wait=60", "Cancel-After": `${Math.max(5, Math.ceil(timeoutMs / 1000))}s` },
          body: JSON.stringify({ version: BACKGROUND_REMOVER_VERSION, input: {
            image: `data:${mimeType};base64,${image.data.toString("base64")}`,
            threshold: 0, reverse: false, background_type: "rgba", format: "png",
          } }),
        }))
        activeId = result.id
        while (result.status === "starting" || result.status === "processing") {
          await delay(1000, undefined, { signal })
          result = await prediction(await fetchChecked(`${PREDICTIONS_URL}/${activeId}`, { headers, signal }))
          if (result.id !== activeId) throw new Error("Replicate returned a mismatched prediction")
        }
        activeId = undefined
        if (result.status !== "succeeded") throw new Error(`Replicate background removal ${result.status}`)
        // Only Replicate's delivery hosts receive authorization. Redirects are forbidden.
        const output = await readBounded(await fetchChecked(deliveryUrl(result.output), { headers, signal }), MAX_IMAGE_BYTES)
        if (detectImageMediaType(output.toString("base64")) !== "image/png") throw new Error("Replicate did not return a PNG image")
        signal.throwIfAborted()
        return { base64: output.toString("base64"), mimeType: "image/png" }
      } catch (error) {
        if (activeId) {
          await fetchChecked(`${PREDICTIONS_URL}/${activeId}/cancel`, {
            method: "POST", headers, signal: AbortSignal.timeout(5000),
          }).then((response) => response.body?.cancel()).catch(() => {})
        }
        if (signal.aborted) signal.throwIfAborted()
        // Keep transport/stream errors from reflecting URLs or credentials.
        if (error instanceof Error && /^(Replicate|Background removal|Could not reach Replicate)/.test(error.message)) throw error
        throw new Error("Replicate background removal failed")
      }
    },
  }
}
