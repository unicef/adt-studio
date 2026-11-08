import { resolveBookPaths, type Storage } from "@adt/storage"
import { assertAuthoredReplacement, assertSectioningIdentityHistory, selectSectioningPages } from "./authored-output.js"
import { loadBookConfig } from "./config.js"
import { sectioningReplacementSignature } from "./sectioning-replacement-signature.js"
import { activeSectioningPages } from "./sectioning-window.js"

/** Read current inputs and validate replacement consent at each admission
 * boundary. The returned snapshot is local to this call, never permission for
 * queued work: reset and publication still validate inside their own boundaries. */
export function admitSectioningRun(
  storage: Storage, label: string, booksRoot: string,
  options: Parameters<typeof assertAuthoredReplacement>[1] & Parameters<typeof assertSectioningIdentityHistory>[1],
  configPath?: string, promptsDir?: string,
) {
  assertAuthoredReplacement(storage, options)
  const { bookDir } = resolveBookPaths(label, booksRoot)
  const config = loadBookConfig(label, booksRoot, configPath)
  const allPages = activeSectioningPages(storage, config, bookDir)
  const inputSignature = sectioningReplacementSignature(storage, label, booksRoot, configPath, promptsDir)
  const pages = selectSectioningPages(storage, allPages, options, inputSignature)
  assertSectioningIdentityHistory(storage, options, pages)
  return { config, allPages, pages, inputSignature }
}
