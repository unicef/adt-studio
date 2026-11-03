import fs from "node:fs"
import path from "node:path"
import type { AppConfig } from "@adt/types"
import type { Storage } from "@adt/storage"
import { publishedAdtDirectory, storyboardCoverage, packageFilesAvailable, normalizeLocale } from "@adt/pipeline"
import { createRetainedPackageReader } from "./retained-package-reader.js"

const readOwnership = createRetainedPackageReader()

/** A retained partial bundle remains usable, but newly rendered source HTML
 * cannot establish that the bundle already contains all its required sections.
 * This checks membership only; ordinary freshness warnings remain independent. */
export function storyboardPackageComplete(storage: Storage, bookDir: string, pageIds: string[], config: AppConfig): boolean {
  const adtDir = publishedAdtDirectory(bookDir)
  if (!fs.existsSync(adtDir)) return false
  const expectedLanguages = [...(config.output_languages ?? []), ...(config.editing_language ? [config.editing_language] : [])].map(normalizeLocale)
  const ownership = readOwnership(storage, path.join(bookDir, path.basename(bookDir) + ".db"), adtDir)
  if (!ownership.allOwned || !packageFilesAvailable(adtDir, { expectedLanguages })) return false
  const entries = ownership.entries
  const coverage = storyboardCoverage(storage, pageIds, (sectionId) =>
    path.basename(sectionId) === sectionId &&
    entries.filter((entry) => entry?.section_id === sectionId && entry.href === `${sectionId}.html`).length === 1 &&
    fs.existsSync(path.join(adtDir, `${sectionId}.html`)))
  return coverage.complete && coverage.rendered > 0
}
