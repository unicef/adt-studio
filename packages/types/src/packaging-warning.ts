import { z } from "zod"

/**
 * Something packaging had to leave out of the bundle.
 *
 * Carried as *data*, not a formatted sentence, for two reasons: the message is
 * composed in `packages/pipeline`, which has no access to the Studio's Lingui
 * catalogs, and a structured warning can be grouped and counted in the UI. The
 * translated wording lives with the component that renders it.
 *
 * - `orphaned-rendering` — a rendered section with no sectioning row behind it.
 *   sectionIds are allocated once and never reused, so packaging cannot invent
 *   one from the array position without risking a collision with a real
 *   section, and two sections resolving to one id overwrite each other's HTML
 *   file. The section is skipped instead, which is silent without this warning.
 *   Usually means `web-rendering` is stale relative to `page-sectioning` — most
 *   often after restoring an older sectioning version, which does not resync
 *   the rendering. Re-running the storyboard render for the page fixes it.
 */
export const PackagingWarning = z.object({
  kind: z.literal("orphaned-rendering"),
  pageId: z.string(),
  sectionIndex: z.number().int(),
})
export type PackagingWarning = z.infer<typeof PackagingWarning>
