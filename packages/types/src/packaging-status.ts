import { z } from "zod"

export const PackagingStatus = z.object({
  label: z.string(),
  hasAdt: z.boolean(),
  version: z.string().optional(),
  /** Current saved sections all have usable output. A partial bundle may still
   * be opened, but must never be presented as complete. */
  complete: z.boolean().optional(),
})
export type PackagingStatus = z.infer<typeof PackagingStatus>
