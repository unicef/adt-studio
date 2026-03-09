import { z } from "zod"

export const SCHEMA_VERSION = 9

export const ImageSource = z.enum(["page", "extract", "crop", "segment", "upload"])
export type ImageSource = z.infer<typeof ImageSource>

export const PageRow = z.object({
  page_id: z.string(),
  page_number: z.number().int(),
  text: z.string(),
})
export type PageRow = z.infer<typeof PageRow>

export const ImageRow = z.object({
  image_id: z.string(),
  page_id: z.string(),
  path: z.string(),
  hash: z.string(),
  width: z.number().int(),
  height: z.number().int(),
  source: ImageSource,
})
export type ImageRow = z.infer<typeof ImageRow>
