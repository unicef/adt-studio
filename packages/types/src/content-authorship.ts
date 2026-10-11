import { z } from "zod"
import { OutputMetadata, OutputEditGuard } from "./output-freshness.js"

/** Authorship only: reuse SPEC-0001's source schema without its lineage/review
 * fields. Absence means unknown and protected; never default legacy data to AI. */
export const AuthoredContent = OutputMetadata.pick({ source: true })
export type AuthoredContent = z.infer<typeof AuthoredContent>

/** Whole-record authorship uses the same version guard as catalog editors. */
export const AuthoredSaveGuard = OutputEditGuard.pick({ baseVersion: true })
export type AuthoredSaveGuard = z.infer<typeof AuthoredSaveGuard>

/** A confirmation names exact protected records and the versions shown. */
export const AuthoredReplacement = z.object({
  node: z.enum(["page-sectioning", "toc-generation"]),
  itemId: z.string().min(1),
  version: z.number().int().positive(),
}).strict()
export type AuthoredReplacement = z.infer<typeof AuthoredReplacement>
export const AuthoredRunOptions = z.object({
  replaceManual: z.boolean().default(false),
  protectedReplacements: z.array(AuthoredReplacement).default([]),
})
export type AuthoredRunOptions = z.infer<typeof AuthoredRunOptions>
