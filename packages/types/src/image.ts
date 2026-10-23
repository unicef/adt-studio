import { z } from "zod"

const IMAGE_FILE_EXTENSIONS: Readonly<Record<string, string>> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
}

/** Naming only, not validation or conversion. Preserve the legacy PNG fallback. */
export function imageFileExtension(mimeType?: string): string {
  const key = mimeType?.toLowerCase() ?? ""
  return Object.hasOwn(IMAGE_FILE_EXTENSIONS, key) ? IMAGE_FILE_EXTENSIONS[key] : "png"
}

/** Desired width / height, before a provider maps it to a supported output size. */
export const ImageAspectRatio = z.number().finite().positive()

export const GeneratedImagePayload = z.object({
  base64: z.string().min(1),
  mimeType: z.string().min(1),
})

export const ValidatedGeneratedImage = GeneratedImagePayload.extend({
  mimeType: z.enum(["image/png", "image/jpeg"]),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
})
export type ValidatedGeneratedImage = z.infer<typeof ValidatedGeneratedImage>
