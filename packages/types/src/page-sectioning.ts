import { z } from "zod"

export const SectionTextEntry = z.object({
  textType: z.string(),
  text: z.string(),
  isPruned: z.boolean(),
})
export type SectionTextEntry = z.infer<typeof SectionTextEntry>

export const SectionTextPart = z.object({
  type: z.literal("text_group"),
  groupId: z.string(),
  groupType: z.string(),
  texts: z.array(SectionTextEntry),
  isPruned: z.boolean(),
})
export type SectionTextPart = z.infer<typeof SectionTextPart>

export const SectionImagePart = z.object({
  type: z.literal("image"),
  imageId: z.string(),
  isPruned: z.boolean(),
  reason: z.string().optional(),
})
export type SectionImagePart = z.infer<typeof SectionImagePart>

export const SectionPart = z.discriminatedUnion("type", [SectionTextPart, SectionImagePart])
export type SectionPart = z.infer<typeof SectionPart>

export const PageSection = z.object({
  sectionType: z.string(),
  parts: z.array(SectionPart),
  backgroundColor: z.string(),
  textColor: z.string(),
  pageNumber: z.number().int().nullable(),
  isPruned: z.boolean(),
})
export type PageSection = z.infer<typeof PageSection>

export const PageSectioningOutput = z.object({
  reasoning: z.string(),
  sections: z.array(PageSection),
})
export type PageSectioningOutput = z.infer<typeof PageSectioningOutput>

/**
 * Build an LLM-facing schema for page sectioning.
 * Enum fields use z.string() so invalid values are caught by our validate
 * callback (which feeds errors back to the LLM) instead of causing a
 * NoObjectGeneratedError that retries blindly.
 */
export function buildPageSectioningLLMSchema() {
  return z.object({
    reasoning: z.string(),
    sections: z.array(
      z.object({
        section_type: z.string(),
        part_ids: z.array(z.string()),
        background_color: z.string(),
        text_color: z.string(),
        page_number: z.number().int().nullable(),
      })
    ),
  })
}
