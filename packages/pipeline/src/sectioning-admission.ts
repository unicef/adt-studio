import { resolveBookPaths, type Storage } from "@adt/storage"
import { STAGE_ORDER, type StageName } from "@adt/types"
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
  const stages = STAGE_ORDER.slice(STAGE_ORDER.indexOf(options.fromStage as StageName), STAGE_ORDER.indexOf(options.toStage as StageName) + 1)
  // Filtered output work and ranges outside Sectioning do not consume its
  // outline or prompt inputs. General replacement consent was checked above.
  if (!stages.includes("sectioning") || options.outputScope?.selection?.identities) {
    return { config, allPages, pages: [], inputSignature: undefined }
  }
  // A genuine ordinary no-op neither replaces output nor consumes generation
  // inputs. Do not read an unrelated outline/prompt just to invent a receipt.
  const needsConsent = options.protectedReplacements?.some(record => record.node === "page-sectioning")
  let inputSignature = needsConsent ? sectioningReplacementSignature(storage, label, booksRoot, configPath, promptsDir) : undefined
  const pages = selectSectioningPages(storage, allPages, options, inputSignature)
  if (pages.length && !inputSignature) inputSignature = sectioningReplacementSignature(storage, label, booksRoot, configPath, promptsDir)
  assertSectioningIdentityHistory(storage, options, pages)
  return { config, allPages, pages, inputSignature }
}
