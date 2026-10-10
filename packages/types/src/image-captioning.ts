import { OutputMetadata } from "./output-freshness.js"
import { z } from "zod"

export const ImageCaption = z.object({
  ...OutputMetadata.shape,
  imageId: z.string(),
  reasoning: z.string(),
  caption: z.string(),
  /**
   * When true, the image is purely decorative: it needs no caption and is
   * hidden from screen readers (rendered with alt="", role="presentation",
   * aria-hidden) in the final output.
   */
  decorative: z.boolean().optional(),
  /**
   * Provenance of this entry. "manual" entries (the user edited the caption or
   * toggled decorative) are preserved wholesale when captioning is re-run;
   * "ai" entries are regenerated. Absent is protected as unknown authorship.
   */
  source: z.enum(["ai", "manual"]).optional(),
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
      /**
       * True when the image is purely decorative (no pedagogic/informational
       * value): it needs no caption and is hidden from screen readers.
       *
       * Required (not optional) because OpenAI structured-output strict mode
       * demands every property appear in `required`. The model always returns
       * a boolean; the stored ImageCaption.decorative remains optional.
       */
      decorative: z.boolean(),
    })
  ),
})
