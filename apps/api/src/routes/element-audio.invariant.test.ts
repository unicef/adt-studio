import { readdirSync, readFileSync, statSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join, resolve } from "node:path"
import { describe, expect, it } from "vitest"
import {
  CATALOG_OUTPUT_NODES,
  IMAGE_SET_CHANGE_CLEAR_NODE_TYPES,
  STAGE_ORDER,
  getStageClearNodes,
  getStageRerunClearNodes,
} from "@adt/types"

// The invariant (docs/INVARIANTS.md, row 11): authored per-element content
// (`element-audio`) is never cleared or deleted by invalidation or extraction.
//
// This is a source scan plus a runtime assertion — the same "two places must
// agree" class of check as apps/adt-runtime/src/app/activity-initializers.test.ts.
// It has to be a source scan because the ad-hoc `clearNodesByType([...])`
// literals cannot be enumerated from a derived list at runtime.

const API_SRC = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const BOOK_STORAGE = resolve(API_SRC, "../../../packages/storage/src/book-storage.ts")

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full))
    else if (name.endsWith(".ts") && !name.endsWith(".test.ts")) out.push(full)
  }
  return out
}

/** The raw argument text of every `clearNodesByType(...)` call in a source file. */
function clearNodesByTypeArgs(source: string): string[] {
  const marker = "clearNodesByType("
  const calls: string[] = []
  let index = source.indexOf(marker)
  while (index !== -1) {
    let depth = 0
    let end = index + marker.length - 1
    for (; end < source.length; end++) {
      const ch = source[end]
      if (ch === "(") depth++
      else if (ch === ")") {
        depth--
        if (depth === 0) break
      }
    }
    calls.push(source.slice(index + marker.length, end))
    index = source.indexOf(marker, end)
  }
  return calls
}

describe("element-audio invariant (AC-7)", () => {
  it("never appears in a clearNodesByType literal in apps/api/src", () => {
    const offenders: string[] = []
    for (const file of sourceFiles(API_SRC)) {
      const source = readFileSync(file, "utf8")
      for (const args of clearNodesByTypeArgs(source)) {
        if (args.includes("element-audio")) offenders.push(file)
      }
    }
    expect(offenders).toEqual([])
  })

  it("is not in IMAGE_SET_CHANGE_CLEAR_NODE_TYPES", () => {
    expect([...IMAGE_SET_CHANGE_CLEAR_NODE_TYPES]).not.toContain("element-audio")
  })

  it("is not in CATALOG_OUTPUT_NODES", () => {
    expect([...CATALOG_OUTPUT_NODES]).not.toContain("element-audio")
  })

  it("is not cleared by any stage clear or rerun pair", () => {
    const offenders: string[] = []
    for (const from of STAGE_ORDER) {
      if (getStageClearNodes(from).includes("element-audio")) offenders.push(`clear:${from}`)
      for (const to of STAGE_ORDER) {
        if (getStageRerunClearNodes(from, to).includes("element-audio")) offenders.push(`${from}->${to}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it("has no explicit reference in the destructive storage primitives", () => {
    // deletePage / clearExtractedData are generic hard-delete paths and remain
    // documented non-goals for a deleted page or a full re-extraction. This
    // asserts that nobody added element-audio to their explicit list.
    const source = readFileSync(BOOK_STORAGE, "utf8")
    expect(source).not.toContain("element-audio")
  })
})
