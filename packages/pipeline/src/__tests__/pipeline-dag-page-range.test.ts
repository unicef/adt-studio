// Real fresh extraction admission, PDF extraction and persistence/publication
// executors. Scheduling is bounded to Extract -> Sectioning -> Storyboard;
// generation is deterministic and makes no external provider calls.
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { createBookStorage, readExtractionManifest } from "@adt/storage"
import { countPdfPages } from "@adt/pdf"
import type { StepName } from "@adt/types"
import type { StepExecutor } from "../dag.js"

const state = vi.hoisted(() => ({ root: "", selected: [] as string[], rendered: [] as string[], changeConfig: false }))
vi.mock("@adt/llm", async original => ({ ...await original<typeof import("@adt/llm")>(), createLLMModel: () => ({}) }))
vi.mock("../page-sectioning.js", async original => ({
  ...await original<typeof import("../page-sectioning.js")>(),
  sectionPage: async (input: { pageId: string; pageNumber: number }) => {
    state.selected.push(input.pageId)
    if (state.changeConfig) fs.appendFileSync(path.join(state.root, "global.yaml"), "\nconcurrency: 2\n")
    return { reasoning: "fixture", sections: [{ sectionId: input.pageId + "_sec001", sectionType: "text_only", pageNumber: input.pageNumber, backgroundColor: "white", textColor: "black", isPruned: false, nodes: [{ nodeId: input.pageId + "_n001", role: "text", text: "Requested page", isPruned: false }] }] }
  },
}))
vi.mock("../web-rendering.js", async original => ({
  ...await original<typeof import("../web-rendering.js")>(),
  renderPage: async (input: { pageId: string; sectioning: { sections: { sectionId: string; sectionType: string }[] } }) => {
    state.rendered.push(input.pageId)
    return { sections: input.sectioning.sections.map((section, sectionIndex) => ({ sectionId: section.sectionId, sectionIndex, sectionType: section.sectionType, reasoning: "fixture", html: `<section data-section-id="${section.sectionId}">Requested page</section>` })) }
  },
}))
vi.mock("../dag.js", async original => ({
  ...await original<typeof import("../dag.js")>(),
  runPipelineDAG: async (executors: Map<StepName, StepExecutor>) => {
    const progress = { emit() {} }
    await executors.get("extract")!(progress)
    const storage = createBookStorage("range", state.root)
    try {
      for (const page of storage.getPages()) storage.putNodeData("image-filtering", page.pageId, { images: [] })
      storage.putNodeData("metadata", "book", { language_code: "en" })
      storage.putNodeData("book-outline", "book", { entries: [], styleClusters: [], reasoning: "fixture" })
    } finally { storage.close() }
    for (const name of ["page-sectioning", "translation", "web-rendering"] as const) await executors.get(name)!(progress)
    return { statuses: new Map(), errors: new Map() }
  },
}))
import { runFullPipeline } from "../pipeline-dag.js"
import { loadBookConfig } from "../config.js"
import { activeSectioningPages } from "../sectioning-lifecycle.js"

let configPath: string
const source = path.resolve("tests/fixtures/raven.pdf")
beforeEach(() => {
  state.root = fs.mkdtempSync(path.join(os.tmpdir(), "dag-effective-range-"))
  state.selected = []; state.rendered = []; state.changeConfig = false
  configPath = path.join(state.root, "global.yaml")
  fs.writeFileSync(configPath, "structure_types: {}\nrole_types: {}\ndefault_model: ollama:tinyllama\nstart_page: 1\nend_page: 1\n")
})
afterEach(() => fs.rmSync(state.root, { recursive: true, force: true }))
const options = () => ({ label: "range", booksRoot: state.root, pdfPath: source, configPath, promptsDir: path.resolve("prompts"), templatesDir: path.resolve("templates") })
function part() {
  const dir = path.join(state.root, "range")
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, "part.json"), JSON.stringify({ adtPart: 1, sourceLabel: "source", title: null, range: { startPage: 2, endPage: 2 }, pageCount: 3, fingerprint: {}, identityHash: "fixture", semanticsHash: "fixture", createdAt: "fixture", partLabelSuggestion: "range" }))
}

it.each([false, true])("fresh CLI overrides reach Sectioning and Storyboard and survive reopen, part=%s", async isPart => {
  if (isPart) part()
  const dir = path.join(state.root, "range")
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, "config.yaml"), "page_sectioning:\n  mode: page\ncore_tts:\n  language_normalization: false\n")
  const globalBefore = fs.readFileSync(configPath)
  await runFullPipeline({ ...options(), startPage: 2, endPage: 2 })
  expect(state.selected).toEqual(["pg002"])
  expect(state.rendered).toEqual(["pg002"])
  const config = loadBookConfig("range", state.root, configPath)
  expect(config.page_sectioning?.mode).toBe("page")
  expect(config.core_tts.language_normalization).toBe(false)
  const storage = createBookStorage("range", state.root)
  try {
    expect(storage.getPages().map(page => page.pageId)).toEqual(["pg002"])
    expect(activeSectioningPages(storage, config, dir).map(page => page.pageId)).toEqual(["pg002"])
    expect(storage.getLatestNodeData("page-sectioning", "pg002")).not.toBeNull()
    expect(storage.getLatestNodeData("web-rendering", "pg002")).not.toBeNull()
    expect(readExtractionManifest(dir)?.inputs).toMatchObject({ startPage: 2, endPage: 2 })
  } finally { storage.close() }
  expect(fs.readFileSync(configPath)).toEqual(globalBefore)
  const before = fs.readFileSync(path.join(dir, "config.yaml"))
  await expect(runFullPipeline({ ...options(), startPage: 2, endPage: 2 })).rejects.toMatchObject({ code: "UNSAFE_RESUME_UNAVAILABLE" })
  expect(fs.readFileSync(path.join(dir, "config.yaml"))).toEqual(before)
  expect(state.selected).toEqual(["pg002"])
}, 30_000)

it("rejects CLI range overrides outside a mandatory part before changing its configuration", async () => {
  part()
  const file = path.join(state.root, "range/config.yaml")
  fs.writeFileSync(file, "page_sectioning:\n  mode: page\n")
  const before = fs.readFileSync(file)
  await expect(runFullPipeline({ ...options(), startPage: 1, endPage: 1 })).rejects.toMatchObject({ code: "EXTRACTION_INPUT_INVALID" })
  expect(fs.readFileSync(file)).toEqual(before)
  expect(readExtractionManifest(path.dirname(file))).toBeNull()
  expect(state.selected).toEqual([])
})

it.each(["none", "start", "end", "both"])("rejects a mandatory part beyond the PDF without mutation, flags=%s", async bounds => {
  part()
  const count = countPdfPages(fs.readFileSync(source))
  const flags = {
    ...(["start", "both"].includes(bounds) ? { startPage: count } : {}),
    ...(["end", "both"].includes(bounds) ? { endPage: count + 1 } : {}),
  }
  const dir = path.join(state.root, "range")
  const manifestFile = path.join(dir, "part.json")
  const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"))
  manifest.range = { startPage: count, endPage: count + 1 }
  manifest.pageCount = count + 1
  fs.writeFileSync(manifestFile, JSON.stringify(manifest))
  fs.copyFileSync(source, path.join(dir, "range.pdf"))
  fs.writeFileSync(path.join(dir, "config.yaml"), `start_page: ${count}\nend_page: ${count + 1}\npage_sectioning:\n  mode: page\n`)
  const before = Object.fromEntries(fs.readdirSync(dir).map(name => [name, fs.readFileSync(path.join(dir, name))]))
  await expect(runFullPipeline({ ...options(), ...flags })).rejects.toMatchObject({ code: "EXTRACTION_INPUT_INVALID" })
  // Compare the retained PDF bytes directly; deep equality traverses millions
  // of Buffer properties and can exhaust the test timeout on CI workers.
  for (const [name, bytes] of Object.entries(before)) expect(fs.readFileSync(path.join(dir, name)).equals(bytes), name).toBe(true)
  expect(fs.readdirSync(dir).sort()).toEqual(Object.keys(before).sort())
  expect(state.selected).toEqual([])
  expect(state.rendered).toEqual([])
}, 30_000)

it("still clamps an optional whole-book end to the physical PDF length", async () => {
  const count = countPdfPages(fs.readFileSync(source))
  await runFullPipeline({ ...options(), startPage: count, endPage: count + 100 })
  const pageId = `pg${String(count).padStart(3, "0")}`
  expect(state.selected).toEqual([pageId])
  expect(state.rendered).toEqual([pageId])
  expect(loadBookConfig("range", state.root, configPath)).toMatchObject({ start_page: count, end_page: count })
  expect(readExtractionManifest(path.join(state.root, "range"))?.inputs).toMatchObject({ startPage: count, endPage: count })
}, 30_000)

it.each([
  { override: { startPage: 2 }, expected: ["pg002", "pg003"] },
  { override: { endPage: 2 }, expected: ["pg001", "pg002"] },
])("honors a single CLI bound while retaining the other configured bound: $override", async ({ override, expected }) => {
  fs.writeFileSync(configPath, "structure_types: {}\nrole_types: {}\ndefault_model: ollama:tinyllama\nstart_page: 1\nend_page: 3\n")
  await runFullPipeline({ ...options(), ...override })
  expect(state.selected).toEqual(expected)
  expect(state.rendered).toEqual(expected)
  const storage = createBookStorage("range", state.root)
  try {
    const config = loadBookConfig("range", state.root, configPath)
    expect(activeSectioningPages(storage, config, path.join(state.root, "range")).map(page => page.pageId)).toEqual(expected)
    for (const id of expected) expect(storage.getLatestNodeData("web-rendering", id)).not.toBeNull()
  } finally { storage.close() }
}, 30_000)

it("leaves inherited configuration untouched when the CLI does not override a range", async () => {
  await runFullPipeline(options())
  expect(state.selected).toEqual(["pg001"])
  expect(state.rendered).toEqual(["pg001"])
  expect(fs.existsSync(path.join(state.root, "range/config.yaml"))).toBe(false)
}, 30_000)

it("still rejects configuration changes before publishing CLI-range Sectioning", async () => {
  state.changeConfig = true
  await expect(runFullPipeline({ ...options(), startPage: 2, endPage: 2 })).rejects.toMatchObject({ code: "STORYBOARD_INPUT_CHANGED" })
  const storage = createBookStorage("range", state.root)
  try {
    expect(storage.getLatestNodeData("page-sectioning", "pg002")).toBeNull()
    expect(storage.getLatestNodeData("web-rendering", "pg002")).toBeNull()
  } finally { storage.close() }
}, 30_000)
