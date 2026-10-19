import { z } from "zod"
import type { AiModality } from "@adt/types"
import type { DiscoveredModel } from "../../ports/index.js"
import { ModelDiscoveryError } from "../../model-discovery.js"
import { isGoogleImageModel } from "./image.js"

/**
 * Model discovery against the Google Generative Language API. Shared by the
 * Google (text/image/agent) and Gemini Speech (TTS) providers: both use the
 * same AI Studio key against the same endpoint, so one listing serves both as
 * a catalogue and as a live credential check.
 */

const GOOGLE_MODELS_URL =
  "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000"
const DISCOVERY_TIMEOUT_MS = 15_000

const GoogleModelsResponse = z.object({
  models: z
    .array(
      z
        .object({
          name: z.string().min(1),
          displayName: z.string().min(1).optional(),
          supportedGenerationMethods: z.array(z.string()).optional(),
        })
        .passthrough(),
    )
    .default([]),
})

/** Google's TTS models carry "tts" in the id (gemini-2.5-flash-preview-tts, gemini-3.1-flash-tts-preview). */
export function isGoogleTtsModel(modelId: string): boolean {
  return /tts/i.test(modelId)
}

function modalitiesForMethods(methods: string[] | undefined): AiModality[] | undefined {
  if (!methods) return undefined
  const modalities: AiModality[] = []
  if (methods.includes("generateContent")) {
    modalities.push("structured-text", "agent")
  }
  return modalities.length > 0 ? modalities : undefined
}

function modalitiesFor(id: string, methods: string[] | undefined): AiModality[] | undefined {
  if (isGoogleImageModel(id)) return ["image"]
  // TTS models also answer generateContent, but they are speech models and
  // must not be offered as text or agent models.
  if (isGoogleTtsModel(id)) return ["tts"]
  return modalitiesForMethods(methods)
}

export async function listGoogleModels(
  apiKey: string,
  signal?: AbortSignal,
): Promise<DiscoveredModel[]> {
  const timeout = AbortSignal.timeout(DISCOVERY_TIMEOUT_MS)
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout

  let response: Response
  try {
    response = await fetch(GOOGLE_MODELS_URL, {
      method: "GET",
      headers: { Accept: "application/json", "x-goog-api-key": apiKey },
      signal: combined,
    })
  } catch {
    throw new ModelDiscoveryError("unreachable", "Could not reach the Google model listing")
  }

  if (!response.ok) {
    const code =
      response.status === 401 || response.status === 403
        ? "missing-credential"
        : "unreachable"
    throw new ModelDiscoveryError(code, `Model listing failed with HTTP ${response.status}`)
  }

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw new ModelDiscoveryError("invalid-response", "Model listing returned invalid JSON")
  }

  const parsed = GoogleModelsResponse.safeParse(payload)
  if (!parsed.success) {
    throw new ModelDiscoveryError("invalid-response", "Unexpected model listing shape")
  }

  const seen = new Set<string>()
  const models: DiscoveredModel[] = []
  for (const entry of parsed.data.models) {
    const id = entry.name.replace(/^models\//, "")
    if (!id || seen.has(id)) continue
    seen.add(id)
    const modalities = modalitiesFor(id, entry.supportedGenerationMethods)
    models.push({
      id,
      ...(entry.displayName ? { displayName: entry.displayName } : {}),
      ...(modalities ? { modalities } : {}),
    })
  }
  return models
}

/** The Gemini Speech catalogue: the same listing, TTS models only. */
export async function listGoogleTtsModels(
  apiKey: string,
  signal?: AbortSignal,
): Promise<DiscoveredModel[]> {
  const models = await listGoogleModels(apiKey, signal)
  return models.filter((model) => isGoogleTtsModel(model.id))
}
