import { z } from "zod"

export const SCHEMA_VERSION = 14

export const ImageSource = z.enum(["page", "extract", "crop", "segment", "upload", "translate"])
export type ImageSource = z.infer<typeof ImageSource>

export const RenderMethodEnum = z.enum(["vector", "page-crop", "raster"])
export type RenderMethodValue = z.infer<typeof RenderMethodEnum>

export const RenderMethod = RenderMethodEnum.nullable()
export type RenderMethod = z.infer<typeof RenderMethod>

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
  render_method: RenderMethod,
  /** Placement on the page in PDF points (top-left origin). */
  bounds_x: z.number().nullable(),
  bounds_y: z.number().nullable(),
  bounds_w: z.number().nullable(),
  bounds_h: z.number().nullable(),
})
export type ImageRow = z.infer<typeof ImageRow>

export const SignLanguageVideoRow = z.object({
  video_id: z.string(),
  section_id: z.string().nullable(),
  path: z.string(),
  original_name: z.string(),
  mime_type: z.string(),
  size_bytes: z.number().int(),
  created_at: z.string(),
})
export type SignLanguageVideoRow = z.infer<typeof SignLanguageVideoRow>
