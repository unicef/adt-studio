import { HTTPException } from "hono/http-exception"
import type { Storage } from "@adt/storage"
import { STAGE_ORDER, type AuthoredReplacement, type StageName } from "@adt/types"
import { isProtectedContent } from "@adt/pipeline"
import { assertEditVersion } from "./catalog-output-service.js"

export function protectedAuthoredRecords(storage: Storage): AuthoredReplacement[] {
  const records: AuthoredReplacement[] = []
  for (const [node, ids] of [["page-sectioning", storage.getPages().map((p) => p.pageId)], ["toc-generation", ["book"]]] as const) {
    for (const itemId of ids) {
      const row = storage.getLatestNodeData(node, itemId)
      if (row && isProtectedContent(row.data as { source?: "ai" | "manual" })) records.push({ node, itemId, version: row.version })
    }
  }
  return records
}

/** Admission runs again when queued work actually acquires the book writer. */
export function assertAuthoredReplacement(storage: Storage, options: {
  fromStage: string; toStage: string; replaceManual?: boolean; protectedReplacements?: AuthoredReplacement[]
}): void {
  const named = options.protectedReplacements ?? []
  if (!options.replaceManual && named.length) throw new HTTPException(400, { message: "Protected replacements require explicit confirmation" })
  if (!options.replaceManual) return
  const from = STAGE_ORDER.indexOf(options.fromStage as StageName)
  const to = STAGE_ORDER.indexOf(options.toStage as StageName)
  const inRange = (stage: StageName) => STAGE_ORDER.indexOf(stage) >= from && STAGE_ORDER.indexOf(stage) <= to
  const expected = protectedAuthoredRecords(storage).filter((r) => inRange(r.node === "page-sectioning" ? "sectioning" : "toc"))
  for (const record of named) {
    assertEditVersion(storage.getLatestNodeData(record.node, record.itemId)?.version, record.version)
  }
  const key = (r: AuthoredReplacement) => `${r.node}/${r.itemId}/${r.version}`
  if (named.length !== expected.length || new Set(named.map(key)).size !== expected.length || expected.some((r) => !named.some((n) => key(n) === key(r)))) {
    throw new HTTPException(409, { message: "Protected work changed. Review the affected pages and TOC before replacing them." })
  }
}

export function replacementConfirmed(options: { replaceManual?: boolean; protectedReplacements?: AuthoredReplacement[] }, node: AuthoredReplacement["node"], itemId: string, version: number): boolean {
  return options.replaceManual === true && !!options.protectedReplacements?.some((r) => r.node === node && r.itemId === itemId && r.version === version)
}

/** Also reject persisted running steps after restart, before any draft write. */
export function assertAuthoredIdle(storage: Storage): void {
  const running = storage.getStepRuns().filter((run) => run.status === "running")
  if (running.length) throw new HTTPException(409, { message: "A pipeline step is running. Keep your draft and retry after it stops." })
}
