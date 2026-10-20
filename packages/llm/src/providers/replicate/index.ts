import { BACKGROUND_REMOVER_MODEL, ReplicateCredentials, type ImageCapabilities } from "@adt/types"
import type { ProviderModule } from "../../ports/index.js"
import { AiProviderError } from "../../ports/errors.js"
import { LABEL_API_KEY } from "../shared/i18n.js"
import { createReplicateBackgroundBackend } from "./image.js"

const capabilities: ImageCapabilities = {
  generate: false, edit: true, sizes: [], mimeTypes: ["image/png", "image/jpeg"], maxReferenceImages: 1,
}

/** This experiment exposes one background-removal model, not general Replicate generation. */
export const replicateProvider: ProviderModule<ReplicateCredentials> = {
  manifest: {
    id: "replicate", displayName: "Replicate", modalities: ["image"],
    credentialFields: [{
      key: "apiKey", kind: "secret", label: LABEL_API_KEY, required: true,
      header: "X-ADT-Provider-Replicate-API-Token", legacyHeaders: [],
      storageKey: "adt-studio-replicate-token", legacyStorageKeys: [],
    }],
    capabilities: { image: capabilities },
    defaultModels: { image: BACKGROUND_REMOVER_MODEL },
    docsUrl: "https://replicate.com/account/api-tokens",
  },
  credentialSchema: ReplicateCredentials,
  resolveServerCredentials: () => ({ apiKey: process.env.REPLICATE_API_TOKEN }),
  cacheFingerprint: () => ({ adapterVersion: "replicate-background-1", origin: "https://api.replicate.com" }),
  capabilitiesFor: (_modality, modelId) => {
    if (modelId !== BACKGROUND_REMOVER_MODEL) {
      throw AiProviderError.unsupportedCapability("replicate", "image", "background-removal model", modelId)
    }
    return undefined
  },
  checkConnection: async ({ credentials, signal }) => {
    try {
      const response = await fetch("https://api.replicate.com/v1/account", {
        headers: { Authorization: `Bearer ${credentials.apiKey}` }, redirect: "error",
        signal: AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(15_000)]),
      })
      await response.body?.cancel()
      return response.ok ? { ok: true, code: "ok" } : {
        ok: false, code: response.status === 401 || response.status === 403 ? "missing-credential" : "unreachable",
        detail: `Replicate connection check returned HTTP ${response.status}`,
      }
    } catch { return { ok: false, code: "unreachable", detail: "Could not reach Replicate" } }
  },
  createImageBackend: ({ credentials }) => createReplicateBackgroundBackend(credentials.apiKey),
}
