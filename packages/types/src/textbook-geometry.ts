import { z } from "zod"

export const TextbookPixelRect = z.object({
  x: z.number().int().min(0),
  y: z.number().int().min(0),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
})
export type TextbookPixelRect = z.infer<typeof TextbookPixelRect>

export const TextbookTextRegion = TextbookPixelRect.extend({
  text_id: z.string(),
  legibility: z.enum(["complete", "clipped"]),
})
export type TextbookTextRegion = z.infer<typeof TextbookTextRegion>

export const TextbookGeometryImagePlan = z.object({
  image_id: z.string(),
  role: z.enum([
    "clean_figure",
    "text_bearing_figure",
    "worksheet_form_composite",
    "page_replica",
  ]),
  keep_visible: z.boolean(),
  crop: TextbookPixelRect.nullable(),
  baked_text_ids: z.array(z.string()),
  text_regions: z.array(TextbookTextRegion),
  writable_regions: z.array(
    TextbookPixelRect.extend({ purpose: z.string().min(1) }),
  ),
  reasoning: z.string(),
})
export type TextbookGeometryImagePlan = z.infer<typeof TextbookGeometryImagePlan>

export const textbookGeometryPlanLLMSchema = z.object({
  reasoning: z.string(),
  images: z.array(TextbookGeometryImagePlan),
})
export type TextbookGeometryPlan = z.infer<typeof textbookGeometryPlanLLMSchema>
