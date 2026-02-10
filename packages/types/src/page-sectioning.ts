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
 * Build an LLM-facing schema with enum-constrained section types and part IDs.
 */
export function buildPageSectioningLLMSchema(
  sectionTypes: [string, ...string[]],
  validPartIds: [string, ...string[]]
) {
  return z.object({
    reasoning: z.string(),
    sections: z.array(
      z.object({
        section_type: z.enum(sectionTypes),
        part_ids: z.array(z.enum(validPartIds)),
        background_color: z.string(),
        text_color: z.string(),
        page_number: z.number().int().nullable(),
      })
    ),
  })
}
