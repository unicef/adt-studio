import { z } from "zod"

export const PageSection = z.object({
  sectionType: z.string(),
  partIds: z.array(z.string()),
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
