import { z } from "zod"

export const ImageCaption = z.object({
  imageId: z.string(),
  reasoning: z.string(),
  caption: z.string(),
})
export type ImageCaption = z.infer<typeof ImageCaption>

export const ImageCaptioningOutput = z.object({
  captions: z.array(ImageCaption),
})
export type ImageCaptioningOutput = z.infer<typeof ImageCaptioningOutput>

export const imageCaptioningLLMSchema = z.object({
  captions: z.array(
    z.object({
      image_id: z.string(),
      reasoning: z.string(),
      caption: z.string(),
    })
  ),
})
