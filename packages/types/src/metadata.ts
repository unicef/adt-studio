import { z } from "zod"

export const BookMetadata = z.object({
  title: z.string().nullable(),
  authors: z.array(z.string()),
  publisher: z.string().nullable(),
  language_code: z.string().nullable(),
  cover_page_number: z.number().int().nullable(),
  reasoning: z.string(),
})
export type BookMetadata = z.infer<typeof BookMetadata>
