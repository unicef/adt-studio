import fs from "node:fs"
import path from "node:path"
import type { AppConfig, StoryboardCoverage } from "@adt/types"
import type { Storage } from "@adt/storage"
import { publishedAdtDirectory, storyboardCoverage, storyboardSourceWarnings, packageFilesAvailable, normalizeLocale } from "@adt/pipeline"
import { readRetainedPackageOwnership } from "./retained-package-reader.js"
import { bookStateKey, createBookStateMemo } from "./book-state-memo.js"

const coverageMemo = createBookStateMemo<{ coverage: StoryboardCoverage; renderable: readonly string[] }>()
const sourceWarningMemo = createBookStateMemo<ReturnType<typeof storyboardSourceWarnings>>()

/** Coverage plus the sections that satisfy every coverage rule except package
 * membership. Derived only from saved state, so it is reused until that changes. */
function coverageState(storage: Storage, bookDir: string, pageIds: string[]) {
  return coverageMemo(JSON.stringify([bookStateKey(storage, bookDir), pageIds]), () => {
    const renderable: string[] = []
    const coverage = storyboardCoverage(storage, pageIds, (sectionId) => { renderable.push(sectionId); return true })
    return { coverage, renderable }
  })
}

/** `storyboardCoverage` for polled read models, reused while the saved book is unchanged. */
export function currentStoryboardCoverage(storage: Storage, bookDir: string, pageIds: string[]): StoryboardCoverage {
  return coverageState(storage, bookDir, pageIds).coverage
}

/** `storyboardSourceWarnings` for polled read models, reused while the saved book is unchanged. */
export function currentStoryboardSourceWarnings(storage: Storage, bookDir: string, pageIds: string[]) {
  return sourceWarningMemo(JSON.stringify([bookStateKey(storage, bookDir), pageIds]), () => storyboardSourceWarnings(storage, pageIds))
}

/** A retained partial bundle remains usable, but newly rendered source HTML
 * cannot establish that the bundle already contains all its required sections.
 * This checks membership only; ordinary freshness warnings remain independent. */
export function storyboardPackageComplete(storage: Storage, bookDir: string, pageIds: string[], config: AppConfig): boolean {
  const adtDir = publishedAdtDirectory(bookDir)
  if (!fs.existsSync(adtDir)) return false
  const expectedLanguages = [...(config.output_languages ?? []), ...(config.editing_language ? [config.editing_language] : [])].map(normalizeLocale)
  const ownership = readRetainedPackageOwnership(storage, path.join(bookDir, path.basename(bookDir) + ".db"), adtDir)
  if (!ownership.allOwned || !packageFilesAvailable(adtDir, { expectedLanguages })) return false
  const { coverage, renderable } = coverageState(storage, bookDir, pageIds)
  const packaged = new Map<string, number>()
  for (const entry of ownership.entries) {
    if (entry?.href === `${entry?.section_id}.html`) packaged.set(entry.section_id, (packaged.get(entry.section_id) ?? 0) + 1)
  }
  // Equivalent to coverage with a membership predicate: every section that is
  // otherwise rendered must have exactly one owned page file in the bundle.
  return coverage.complete && coverage.rendered > 0 && renderable.every((sectionId) =>
    path.basename(sectionId) === sectionId &&
    packaged.get(sectionId) === 1 &&
    fs.existsSync(path.join(adtDir, `${sectionId}.html`)))
}
