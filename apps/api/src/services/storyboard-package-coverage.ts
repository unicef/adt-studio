import fs from "node:fs"
import path from "node:path"
import type { Storage } from "@adt/storage"
import { storyboardCoverage } from "@adt/pipeline"

/** A retained partial bundle remains usable, but newly rendered source HTML
 * cannot establish that the bundle already contains all its required sections.
 * This checks membership only; ordinary freshness warnings remain independent. */
export function storyboardPackageComplete(storage: Storage, bookDir: string, pageIds: string[]): boolean {
  const adtDir = path.join(bookDir, "adt")
  let manifest: unknown
  try { manifest = JSON.parse(fs.readFileSync(path.join(adtDir, "content", "pages.json"), "utf8")) }
  catch { return false }
  if (!Array.isArray(manifest)) return false
  const entries = manifest as Array<{ section_id?: unknown; href?: unknown } | null>
  const coverage = storyboardCoverage(storage, pageIds, (sectionId) =>
    path.basename(sectionId) === sectionId &&
    entries.filter((entry) => entry?.section_id === sectionId && entry.href === `${sectionId}.html`).length === 1 &&
    fs.existsSync(path.join(adtDir, `${sectionId}.html`)))
  return coverage.complete && coverage.rendered > 0
}
