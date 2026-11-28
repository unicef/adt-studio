import { readdirSync, readFileSync, statSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join, resolve } from "node:path"
import { describe, expect, it } from "vitest"
import {
  CATALOG_OUTPUT_NODES,
  ELEMENT_AUDIO_NODE,
  IMAGE_SET_CHANGE_CLEAR_NODE_TYPES,
  STAGE_ORDER,
  getStageClearNodes,
  getStageRerunClearNodes,
} from "@adt/types"

// The invariant (docs/INVARIANTS.md, row 11): authored per-element content
// (`element-audio`) is never cleared or deleted by invalidation or extraction.
//
// Source scan plus runtime assertions. The scan covers apps/api/src and every
// packages/*/src, because a literal can live outside the API (the pipeline has
// clearNodesByType calls too). The generic deletePage/clearExtractedData paths
// are documented non-goals for a deleted page or a full re-extraction; they are
// not asserted here (a source scan cannot protect them).

const API_SRC = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const PACKAGES_ROOT = resolve(API_SRC, "../../../packages")

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full))
    else if (name.endsWith(".ts") && !name.endsWith(".test.ts")) out.push(full)
  }
  return out
}

function packageSourceFiles(): string[] {
  const out: string[] = []
  for (const name of readdirSync(PACKAGES_ROOT)) {
    const src = join(PACKAGES_ROOT, name, "src")
    try {
      if (statSync(src).isDirectory()) out.push(...sourceFiles(src))
    } catch {
      // Package without a src directory.
    }
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
  it("detects a literal argument (checker self-test)", () => {
    expect(clearNodesByTypeArgs('clearNodesByType(["element-audio"])')).toEqual(['["element-audio"]'])
    expect(clearNodesByTypeArgs("clearNodesByType([ELEMENT_AUDIO_NODE])")).toEqual(["[ELEMENT_AUDIO_NODE]"])
  })

  it("has source files to scan", () => {
    expect(sourceFiles(API_SRC).length).toBeGreaterThan(10)
    expect(packageSourceFiles().length).toBeGreaterThan(0)
  })

  it("never appears in a clearNodesByType literal in apps/api/src or packages/*/src", () => {
    const offenders: string[] = []
    for (const file of [...sourceFiles(API_SRC), ...packageSourceFiles()]) {
      const source = readFileSync(file, "utf8")
      for (const args of clearNodesByTypeArgs(source)) {
        if (args.includes("element-audio") || args.includes("ELEMENT_AUDIO_NODE")) offenders.push(file)
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
})
