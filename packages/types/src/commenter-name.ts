import { z } from "zod"

export const COMMENTER_NAME_MAX_LENGTH = 60

/** One definition for every route that takes a commenter's display name — the session routes
 *  and, since worker 0.5.1, the access door that collects it on the way in. It sits in its own
 *  module because `publication.ts` and `publish-comment.ts` would otherwise have to import each
 *  other, and both schemas are built at module load. */
export const CommenterDisplayName = z
  .string()
  .trim()
  .min(1)
  .max(COMMENTER_NAME_MAX_LENGTH)
export type CommenterDisplayName = z.infer<typeof CommenterDisplayName>
