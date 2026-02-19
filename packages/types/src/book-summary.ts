import { z } from "zod"

export const BookSummaryOutput = z.object({
  summary: z.string(),
})
export type BookSummaryOutput = z.infer<typeof BookSummaryOutput>
