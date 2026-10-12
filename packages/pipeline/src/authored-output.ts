import type { Storage } from "@adt/storage"
import { STAGE_ORDER, PIPELINE, getStageDependents, type AuthoredReplacement, type StageName } from "@adt/types"
import { isProtectedContent } from "./manual-edits.js"
export class AuthoredReplacementError extends Error {
  readonly code: "VERSION_CONFLICT" | "REPLACEMENT_CONFIRMATION_INVALID"
  constructor(readonly status: 400 | 409, message: string, readonly currentVersion?: number) {
    const code = currentVersion !== undefined ? "VERSION_CONFLICT" : "REPLACEMENT_CONFIRMATION_INVALID"
    super(`${code}: ${message}`)
    this.code = code
    this.name = "AuthoredReplacementError"
  }
}


export function protectedAuthoredRecords(storage: Storage): AuthoredReplacement[] {
  const records: AuthoredReplacement[] = []
  for (const [node, ids] of [["page-sectioning", storage.getPages().map((p) => p.pageId)], ["toc-generation", ["book"]]] as const) {
    for (const itemId of ids) {
      const version = storage.getSelectedNodeVersion(node, itemId)
      let row: ReturnType<Storage["getLatestNodeData"]> = null
      if (node !== "page-sectioning") row = storage.getLatestNodeData(node, itemId)
      if (version && (node === "page-sectioning" || row && isProtectedContent(row.data as { source?: "ai" | "manual" }))) records.push({
        node, itemId, version,
        ...(node === "page-sectioning" ? {
          renderingVersion: storage.getSelectedNodeVersion("web-rendering", itemId) ?? 0,
          renderTreeVersion: storage.getSelectedNodeVersion("fixed-layout-sectioning", itemId) ?? 0,
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
      record.renderTreeVersion !== (storage.getSelectedNodeVersion("fixed-layout-sectioning", record.itemId) ?? 0)
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
}): T[] {
  const ids = new Set(pages.map((page) => page.pageId))
  if (options.protectedReplacements?.some((r) => r.node === "page-sectioning" && !ids.has(r.itemId))) {
    throw new AuthoredReplacementError(409, "Replacement pages are outside the active book window.")
  }
  return pages.filter((page) => {
    const version = storage.getSelectedNodeVersion("page-sectioning", page.pageId)
    return version === null || replacementConfirmed(options, "page-sectioning", page.pageId, version)
  })
}

/** Reset is a separately confirmed, database-only transaction. It intentionally
 * survives a subsequent generation failure; the authored Sectioning does not
 * change until that page successfully publishes. No rows or assets are deleted. */
export function resetSectioningStoryboard(storage: Storage, options: {
  fromStage: string; toStage: string; replaceManual?: boolean; protectedReplacements?: AuthoredReplacement[]
}): void {
  const records = options.protectedReplacements?.filter((r) => r.node === "page-sectioning") ?? []
  if (!records.length) return
  storage.transaction(() => {
    assertAuthoredReplacement(storage, options)
    for (const record of records) {
      for (const node of ["web-rendering", "fixed-layout-sectioning"]) {
        if (storage.getSelectedNodeVersion(node, record.itemId) !== null) storage.putNodeData(node, record.itemId, null)
      }
    }
    const affected = ["sectioning", "storyboard", ...getStageDependents("storyboard")]
    storage.clearStepRuns(PIPELINE.filter((stage) => affected.includes(stage.name)).flatMap((stage) => stage.steps.map((step) => step.name)))
  })
}
