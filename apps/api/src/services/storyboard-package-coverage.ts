import fs from "node:fs"
import path from "node:path"
import type { AppConfig, BookSummary, StoryboardCoverage } from "@adt/types"
import { HistoryIntegrityError, type Storage } from "@adt/storage"
import { publishedAdtDirectory, packageFilesAvailable, normalizeLocale } from "@adt/pipeline"
import { readRetainedPackageOwnership } from "./retained-package-reader.js"
import { readStoryboardModel } from "./storyboard-read-model.js"

/** `storyboardCoverage` for polled read models, reused while the saved book is unchanged. */
export function currentStoryboardCoverage(storage: Storage, bookDir: string, pageIds: string[]): StoryboardCoverage {
  return readStoryboardModel(storage, bookDir, pageIds).coverage
}

/** `storyboardSourceWarnings` for polled read models, reused while the saved book is unchanged. */
export function currentStoryboardSourceWarnings(storage: Storage, bookDir: string, pageIds: string[]) {
  return readStoryboardModel(storage, bookDir, pageIds).warnings
}

/** A retained partial bundle remains usable, but newly rendered source HTML
 * cannot establish that the bundle already contains all its required sections.
 * This checks membership only; ordinary freshness warnings remain independent. */
export function storyboardPackageStatus(storage: Storage, bookDir: string, pageIds: string[], config: AppConfig, cachedOnly = false): NonNullable<BookSummary["previewStatus"]> {
  const adtDir = publishedAdtDirectory(bookDir)
  if (!fs.existsSync(adtDir)) return "incomplete"
  const { coverage, renderable } = readStoryboardModel(storage, bookDir, pageIds)
  if (!coverage.complete || !coverage.rendered) return "incomplete"
  const expectedLanguages = [...(config.output_languages ?? []), ...(config.editing_language ? [config.editing_language] : [])].map(normalizeLocale)
  const readOwnership = cachedOnly ? readRetainedPackageOwnership.peek : readRetainedPackageOwnership
  let ownership: ReturnType<typeof readOwnership>
  try { ownership = readOwnership(storage, path.join(bookDir, path.basename(bookDir) + ".db"), adtDir) }
  catch (error) {
    // Unreadable reading-order evidence cannot prove an owned package. Keep
    // independent metadata/coverage usable; explicit downloads retain the
    // typed recovery refusal instead of omitting the damaged dependency.
    if (!(error instanceof HistoryIntegrityError)) throw error
    return "unverified"
  }
  if (!ownership) return "unverified"
  if (!ownership.allOwned) return "incomplete"
  // A cold or invalidated bounded proof says nothing about actual completeness.
  if (!packageFilesAvailable(adtDir, { expectedLanguages, cachedOnly })) return cachedOnly ? "unverified" : "incomplete"
  const packaged = new Map<string, number>()
  for (const entry of ownership.entries) {
    if (entry?.href === `${entry?.section_id}.html`) packaged.set(entry.section_id, (packaged.get(entry.section_id) ?? 0) + 1)
  }
  // Equivalent to coverage with a membership predicate: every section that is
  // otherwise rendered must have exactly one owned page file in the bundle.
  return renderable.every((sectionId) =>
    path.basename(sectionId) === sectionId &&
    packaged.get(sectionId) === 1 &&
    fs.existsSync(path.join(adtDir, `${sectionId}.html`))) ? "complete" : "incomplete"
}

/** Full checks and existing boolean callers retain their conservative contract. */
export function storyboardPackageComplete(storage: Storage, bookDir: string, pageIds: string[], config: AppConfig, cachedOnly = false): boolean {
  return storyboardPackageStatus(storage, bookDir, pageIds, config, cachedOnly) === "complete"
}
