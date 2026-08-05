import { z } from "zod"
import { BookFontRole } from "./book-fonts.js"

export const FontAssignment = z.object({
  font_id: z.string(),
  role: BookFontRole,
  usage_notes: z.string(),
})
export type FontAssignment = z.infer<typeof FontAssignment>

export const FontAssignmentOutput = z.object({
  reasoning: z.string(),
  assignments: z.array(FontAssignment),
})
export type FontAssignmentOutput = z.infer<typeof FontAssignmentOutput>
