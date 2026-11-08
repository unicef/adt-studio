import type { Storage } from "@adt/storage"
import { STAGE_ORDER, PIPELINE, getStageDependents, EDITABLE_ACTIVITY_NODE, PageSectioningOutput, type AuthoredReplacement, type StageName, type OutputRunScope } from "@adt/types"
import { isProtectedContent } from "./manual-edits.js"
import { withSourceGenerationTracking } from "./source-generation-state.js"
import { collectSpentContentIds } from "./content-ids.js"
import { SectioningSafetyError } from "./sectioning-errors.js"
export class AuthoredReplacementError extends Error {
  readonly code: "VERSION_CONFLICT" | "REPLACEMENT_CONFIRMATION_INVALID"
  constructor(readonly status: 400 | 409, message: string, readonly currentVersion?: number) {
    const code = currentVersion !== undefined ? "VERSION_CONFLICT" : "REPLACEMENT_CONFIRMATION_INVALID"
    super(`${code}: ${message}`)
    this.code = code
    this.name = "AuthoredReplacementError"
  }
}


export function protectedAuthoredRecords(storage: Storage, sectioningInputSignature?: string): AuthoredReplacement[] {
  const records: AuthoredReplacement[] = []
  for (const [node, ids] of [["page-sectioning", storage.getPages().map((p) => p.pageId)], ["toc-generation", ["book"]]] as const) {
    for (const itemId of ids) {
      const version = storage.getSelectedNodeVersion(node, itemId)
      let row: ReturnType<Storage["getLatestNodeData"]> = null
      if (node !== "page-sectioning") row = storage.getLatestNodeData(node, itemId)
      if (version && (node === "page-sectioning" || row && isProtectedContent(row.data as { source?: "ai" | "manual" }))) records.push({
        node, itemId, version,
        ...(node === "page-sectioning" ? {
          sectioningInputSignature,
          renderingVersion: storage.getSelectedNodeVersion("web-rendering", itemId) ?? 0,
          renderTreeVersion: storage.getSelectedNodeVersion("fixed-layout-sectioning", itemId) ?? 0,
          editableActivityVersion: storage.getSelectedNodeVersion(EDITABLE_ACTIVITY_NODE, itemId) ?? 0,
        } : {}),
      })
    }
  }
  return records
}

/** Admission runs again when queued work actually acquires the book writer. */
export function assertAuthoredReplacement(storage: Storage, options: {
  fromStage: string; toStage: string; replaceManual?: boolean; protectedReplacements?: AuthoredReplacement[]
}): void {
  const named = options.protectedReplacements ?? []
  if (!options.replaceManual && named.length) throw new AuthoredReplacementError(400, "Protected replacements require explicit confirmation")
  if (!options.replaceManual) return
  const from = STAGE_ORDER.indexOf(options.fromStage as StageName)
  const to = STAGE_ORDER.indexOf(options.toStage as StageName)
  const inRange = (stage: StageName) => STAGE_ORDER.indexOf(stage) >= from && STAGE_ORDER.indexOf(stage) <= to
  if (!named.length) throw new AuthoredReplacementError(409, "Review the affected content before replacing it.")
  const seen = new Set<string>()
  for (const record of named) {
    const key = `${record.node}/${record.itemId}`
    if (seen.has(key) || !inRange(record.node === "page-sectioning" ? "sectioning" : "toc")) {
      throw new AuthoredReplacementError(400, "Replacement scope is invalid.")
    }
    seen.add(key)
    const current = storage.getSelectedNodeVersion(record.node, record.itemId) ?? 0
    if (current !== record.version) throw new AuthoredReplacementError(409, "Content changed. Your draft has not been saved. Refresh before retrying.", current)
    if (record.node === "page-sectioning" && (
      record.renderingVersion !== (storage.getSelectedNodeVersion("web-rendering", record.itemId) ?? 0) ||
      record.renderTreeVersion !== (storage.getSelectedNodeVersion("fixed-layout-sectioning", record.itemId) ?? 0) ||
      (record.editableActivityVersion ?? 0) !== (storage.getSelectedNodeVersion(EDITABLE_ACTIVITY_NODE, record.itemId) ?? 0)
    )) throw new AuthoredReplacementError(409, "Storyboard changed. Review the affected pages before resetting their output.", current)
  }

}

export function replacementConfirmed(options: { replaceManual?: boolean; protectedReplacements?: AuthoredReplacement[] }, node: AuthoredReplacement["node"], itemId: string, version: number): boolean {
  return options.replaceManual === true && !!options.protectedReplacements?.some((r) => r.node === node && r.itemId === itemId && r.version === version)
}

/** Ordinary Sectioning fills missing records. Existing trees, including empty
 * manual trees, require separately named replacement consent in both runners. */
export function selectSectioningPages<T extends { pageId: string }>(storage: Storage, pages: readonly T[], options: {
  replaceManual?: boolean; protectedReplacements?: AuthoredReplacement[]
}, sectioningInputSignature?: string): T[] {
  assertSectioningInputConsent(options, sectioningInputSignature)
  const ids = new Set(pages.map((page) => page.pageId))
  if (options.protectedReplacements?.some((r) => r.node === "page-sectioning" && !ids.has(r.itemId))) {
    throw new AuthoredReplacementError(409, "Replacement pages are outside the active book window.")
  }
  return pages.filter((page) => {
    const version = storage.getSelectedNodeVersion("page-sectioning", page.pageId)
    return version === null || replacementConfirmed(options, "page-sectioning", page.pageId, version)
  })
}

function assertSectioningInputConsent(options: { protectedReplacements?: AuthoredReplacement[] }, currentSignature?: string): void {
  if (options.protectedReplacements?.some(record => record.node === "page-sectioning" &&
    (!currentSignature || record.sectioningInputSignature !== currentSignature))) {
    throw new AuthoredReplacementError(409, "Sectioning settings or page window changed. Review the affected pages before resetting their output.")
  }
}

/** Share the allocator's actual historical reservation scan. An unrelated
 * unreadable row can conceal a custom ID belonging to this page. No-op runs and
 * downstream-only work do not allocate identities and retain their access. */
export function assertSectioningIdentityHistory(storage: Storage, options: {
  fromStage: string; toStage: string; outputScope?: OutputRunScope
}, selectedPages: readonly { pageId: string }[]): void {
  const stages = STAGE_ORDER.slice(STAGE_ORDER.indexOf(options.fromStage as StageName), STAGE_ORDER.indexOf(options.toStage as StageName) + 1)
  if (!stages.includes("sectioning") || options.outputScope?.selection?.identities || !selectedPages.length) return
  collectSpentContentIds(storage)
  // Readable JSON can still be unusable Sectioning. Refuse selected existing
  // trees before a separately committed reset, at admission and execution.
  const unreadable = selectedPages.filter(({ pageId }) => storage.getSelectedNodeVersion("page-sectioning", pageId) !== null &&
    !PageSectioningOutput.safeParse(storage.getLatestNodeData("page-sectioning", pageId)?.data).success).map(({ pageId }) => pageId)
  if (unreadable.length) throw new SectioningSafetyError("SECTIONING_INPUT_UNREADABLE", `${unreadable.slice(0, 20).join(", ")}; total=${unreadable.length}`)
}

/** Reset is a separately confirmed, database-only transaction. It intentionally
 * survives a subsequent generation failure; the authored Sectioning does not
 * change until that page successfully publishes. No rows or assets are deleted. */
export function resetSectioningStoryboard(storage: Storage, options: {
  fromStage: string; toStage: string; replaceManual?: boolean; protectedReplacements?: AuthoredReplacement[]
}, sectioningInputSignature?: string): void {
  const records = options.protectedReplacements?.filter((r) => r.node === "page-sectioning") ?? []
  if (!records.length) return
  withSourceGenerationTracking(storage, () => {
    assertSectioningInputConsent(options, sectioningInputSignature)
    assertAuthoredReplacement(storage, options)
    assertSectioningIdentityHistory(storage, options, records.map(record => ({ pageId: record.itemId })))
    for (const record of records) {
      for (const node of ["web-rendering", "fixed-layout-sectioning", EDITABLE_ACTIVITY_NODE]) {
        if (storage.getSelectedNodeVersion(node, record.itemId) !== null) storage.putNodeData(node, record.itemId, null)
      }
    }
    const affected = ["sectioning", "storyboard", ...getStageDependents("storyboard")]
    storage.clearStepRuns(PIPELINE.filter((stage) => affected.includes(stage.name)).flatMap((stage) => stage.steps.map((step) => step.name)))
  })
}
