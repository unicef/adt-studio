import { z } from "zod"
import { OutputMetadata } from "./output-freshness.js"

/** Authorship only: reuse SPEC-0001's source schema without its lineage/review
 * fields. Absence means unknown and protected; never default legacy data to AI. */
export const AuthoredContent = OutputMetadata.pick({ source: true })
export type AuthoredContent = z.infer<typeof AuthoredContent>
