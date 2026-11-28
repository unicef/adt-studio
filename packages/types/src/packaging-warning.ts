import { z } from "zod"

/**
 * Content packaging omitted or could not make usable in the target reader.
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
 * - `missing-asset` — a page (or a shared file) refers to an image, media file
 *   or other resource that is not in the bundle. The bundle is still built and
 *   opens; only that resource is absent. `document` names the bundle file that
 *   holds the reference and `reference` the unresolved target. `pageId` is
 *   empty when the document is not a book page.
 * - `unreadable-page` — the exported EPUB page is not valid XHTML after the
 *   format's repairs. Its bytes are retained; `document` names the page the
 *   user should review before sharing the publication.
 */
export const PackagingWarning = z.object({
  kind: z.enum(["orphaned-rendering", "missing-storyboard", "storyboard-source-changed", "missing-asset", "unreadable-page"]),
  pageId: z.string(),
  sectionIndex: z.number().int().optional(),
  document: z.string().max(512).optional(),
  reference: z.string().max(512).optional(),
})
export type PackagingWarning = z.infer<typeof PackagingWarning>
