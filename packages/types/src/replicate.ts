import { z } from "zod"

// Pin the documented model version so repeated trials and caches are reproducible.
export const BACKGROUND_REMOVER_VERSION = "a029dff38972b5fda4ec5d75d7d1cd25aeff621d2cf4946a41055d7db66b80bc"
export const BACKGROUND_REMOVER_MODEL = `851-labs/background-remover:${BACKGROUND_REMOVER_VERSION}`
export const BACKGROUND_REMOVER_MODEL_ID = `replicate:${BACKGROUND_REMOVER_MODEL}`
export const BACKGROUND_REMOVER_INSTRUCTIONS = "Remove the background with soft alpha; output an RGBA PNG."

export const ReplicateCredentials = z.object({ apiKey: z.string().trim().min(1).max(400) })
export type ReplicateCredentials = z.infer<typeof ReplicateCredentials>

export const ReplicatePrediction = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
  status: z.enum(["starting", "processing", "succeeded", "failed", "canceled"]),
  output: z.string().nullable().optional(),
})
export type ReplicatePrediction = z.infer<typeof ReplicatePrediction>
