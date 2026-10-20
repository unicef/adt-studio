import { z } from "zod"

const CleanupImageId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/).max(200)

/** Coordinates in the rendered page image's pixels, not PDF points. */
export const ImageCleanupRegion = z.object({
  x: z.number().int().min(0),
  y: z.number().int().min(0),
  width: z.number().int().min(16).max(16000),
  height: z.number().int().min(16).max(16000),
})
export type ImageCleanupRegion = z.infer<typeof ImageCleanupRegion>

export const ImageCleanupRequest = z.object({
  sourceImageId: CleanupImageId,
  region: ImageCleanupRegion,
  prompt: z.string().trim().min(1).max(4000),
  modelId: z.string().trim().min(1).max(200).optional(),
  expectedVersion: z.number().int().positive().nullable(),
})
export type ImageCleanupRequest = z.infer<typeof ImageCleanupRequest>

export const ImageCleanupCandidate = ImageCleanupRequest.extend({
  imageId: CleanupImageId,
  cropImageId: CleanupImageId,
  pageId: CleanupImageId,
  modelId: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  mimeType: z.enum(["image/png", "image/jpeg"]),
  cached: z.boolean(),
  createdAt: z.string(),
  acceptedVersion: z.number().int().positive().nullable().optional(),
})
export type ImageCleanupCandidate = z.infer<typeof ImageCleanupCandidate>

export const ImageCleanupAcceptance = z.object({ imageId: CleanupImageId })
