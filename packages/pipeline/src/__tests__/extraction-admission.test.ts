import { afterEach, describe, expect, it, vi } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { pathToFileURL } from "node:url"
import { z } from "zod"
import { createLLMModel, createProviderRegistry } from "@adt/llm"
import { AppConfig } from "@adt/types"
import { createBookStorage, extractionHash, readExtractionManifest, withBookWriter, assertExtractionReadable } from "@adt/storage"
import { extractPDF } from "../pdf-extraction.js"
import { extractionOptionsFromConfig, prepareExtractionAdmission } from "../extraction-admission.js"
import { runFullPipeline } from "../pipeline-dag.js"

const root = path.resolve(import.meta.dirname, "../../../..")
const pdf = path.join(root, "tests/fixtures/raven.pdf")
const dirs: string[] = []
const quiet = { emit() {} }
afterEach(() => { vi.restoreAllMocks(); for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true }) })

function fixture() {
  const booksRoot = fs.mkdtempSync(path.join(os.tmpdir(), "adt-admission-"))
  dirs.push(booksRoot)
  const bookDir = path.join(booksRoot, "book")
  const storage = createBookStorage("book", booksRoot)
  const options = { pdfPath: pdf, startPage: 1, endPage: 1 }
  return { booksRoot, bookDir, storage, options }
}

function bytes(directory: string): Record<string, string> {
  const result: Record<string, string> = {}
  function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".book-writer") || entry.name.endsWith(".lock")) continue
      const file = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(file)
      else result[path.relative(directory, file)] = extractionHash(fs.readFileSync(file))
    }
  }
  walk(directory)
  return result
}

describe("SPEC-0010 extraction admission", { timeout: 30_000 }, () => {
  it("publishes complete durable provenance and reuses without changing histories, identities, manual content, media or caches", async () => {
    const f = fixture()
    try {
      f.storage.putNodeData("metadata", "book", { title: "Imported title" })
      expect(await extractPDF(f.options, f.storage, quiet)).toBe("extracted")
      const manifest = readExtractionManifest(f.bookDir)!
      expect(manifest.status).toBe("complete")
      expect(manifest.pages.map((p) => p.pageId)).toEqual(["pg001"])
      expect(manifest.assets.some((a) => a.path === "book.pdf")).toBe(true)
      f.storage.putNodeData("page-sectioning", "pg001", { sections: [{ sectionId: "pg001_sec009" }] })
      f.storage.putNodeData("page-sectioning", "pg001", { sections: [{ sectionId: "pg001_sec012", manual: true }] })
      f.storage.putNodeData("core-tts-catalog", "en", { entries: [{ text: "Manual normalization", generation: { mode: "manual" } }] })
      f.storage.putSignLanguageVideo("video", Buffer.from("retained-video"), "upload.mp4", "video/mp4")
      f.storage.assignSignLanguageVideo("video", "pg001_sec012")
      for (const dir of ["audio", ".cache"]) fs.mkdirSync(path.join(f.bookDir, dir), { recursive: true })
      fs.writeFileSync(path.join(f.bookDir, "audio/manual.mp3"), "retained-audio")
      fs.writeFileSync(path.join(f.bookDir, ".cache/valid.json"), '{"cached":"response"}')
      // Editor-owned versions and extra assets are outside original proof.
      f.storage.putNodeData("positioned-text", "pg001", { edited: true })
      f.storage.putCroppedImage({ imageId: "user-image", pageId: "pg001", version: 1, buffer: Buffer.from("crop"), width: 1, height: 1 })
      const before = bytes(f.bookDir)
      const events = vi.fn()
      expect(await extractPDF(f.options, f.storage, { emit: events })).toBe("reused")
      expect(events).not.toHaveBeenCalled()
      expect(bytes(f.bookDir)).toEqual(before)
      expect(f.storage.getAllNodeVersions("metadata", "book")[0].data).toEqual({ title: "Imported title" })
      expect(f.storage.putNodeData("page-sectioning", "pg001", { next: true })).toBe(3)
      expect(f.storage.getSignLanguageVideos()[0].sectionId).toBe("pg001_sec012")
    } finally { f.storage.close() }
  })

  it("rejects same-length changed source bytes before stored source, rows or media change", async () => {
    const f = fixture()
    try {
      await extractPDF(f.options, f.storage, quiet)
      const changed = Buffer.from(fs.readFileSync(pdf))
      changed[changed.length - 1] ^= 1
      const other = path.join(f.booksRoot, "changed.pdf")
      fs.writeFileSync(other, changed)
      const before = bytes(f.bookDir)
      await expect(extractPDF({ ...f.options, pdfPath: other }, f.storage, quiet)).rejects.toMatchObject({ code: "EXTRACTION_SOURCE_CHANGED" })
      expect(bytes(f.bookDir)).toEqual(before)
    } finally { f.storage.close() }
  })

  it("extracts a user-selected fresh label without transferring old edits or changing the old book", async () => {
    const f = fixture()
    try {
      await extractPDF(f.options, f.storage, quiet)
      f.storage.putNodeData("page-sectioning", "pg001", { manual: "keep only in old book" })
      const before = bytes(f.bookDir)
      const fresh = createBookStorage("chosen-new-book", f.booksRoot)
      try {
        expect(await extractPDF({ ...f.options, endPage: 2 }, fresh, quiet)).toBe("extracted")
        expect(fresh.getPages()).toHaveLength(2)
        expect(fresh.getLatestNodeData("page-sectioning", "pg001")).toBeNull()
        expect(bytes(f.bookDir)).toEqual(before)
      } finally { fresh.close() }
    } finally { f.storage.close() }
  })

  it("normalizes defaults, effective spread pairs, part windows and downstream-only config", () => {
    const f = fixture()
    try {
      withBookWriter(f.bookDir, () => {
        const base = prepareExtractionAdmission(f.bookDir, { pdfPath: pdf }).inputs
        const explicit = prepareExtractionAdmission(f.bookDir, { pdfPath: pdf, startPage: 1, endPage: base.endPage, spreadMode: false, vectorTextGrouping: true, keepCoveredRasters: false, removeWatermarks: false, fixedLayout: false }).inputs
        expect(explicit).toEqual(base)
        const downstream = extractionOptionsFromConfig(pdf, AppConfig.parse({ structure_types: {}, role_types: {}, language: "fr", concurrency: 2 }))
        expect(prepareExtractionAdmission(f.bookDir, downstream).inputs).toEqual(base)
        const pairs = prepareExtractionAdmission(f.bookDir, { pdfPath: pdf, spreadPairs: [3, 2, 2, 999] }).inputs
        expect(pairs.spreadPairs).toEqual([2])
        fs.writeFileSync(path.join(f.bookDir, "part.json"), JSON.stringify({ adtPart: 1, sourceLabel: "source", title: null, range: { startPage: 2, endPage: 3 }, pageCount: base.endPage, fingerprint: {}, identityHash: "x", semanticsHash: "x", createdAt: "date", partLabelSuggestion: "part" }))
        expect(prepareExtractionAdmission(f.bookDir, { pdfPath: pdf }).inputs).toMatchObject({ startPage: 2, endPage: 3 })
        expect(() => prepareExtractionAdmission(f.bookDir, { pdfPath: pdf, startPage: 1 })).toThrow("EXTRACTION_INPUT_INVALID")
      })
    } finally { f.storage.close() }
  })

  it.each([
    { endPage: 2 }, { spreadMode: true }, { vectorTextGrouping: false },
    { keepCoveredRasters: true }, { removeWatermarks: true }, { fixedLayout: true },
  ])("rejects changed extraction inputs %j without writes", async (changed) => {
    const f = fixture()
    try {
      await extractPDF(f.options, f.storage, quiet)
      const before = bytes(f.bookDir)
      await expect(extractPDF({ ...f.options, ...changed }, f.storage, quiet)).rejects.toMatchObject({ code: "EXTRACTION_INPUTS_CHANGED" })
      expect(bytes(f.bookDir)).toEqual(before)
    } finally { f.storage.close() }
  })

  it.each(["missing", "corrupt", "contract", "incomplete", "zero-pages", "legacy", "truncated-inventory"])("refuses %s provenance and retains the entire book", async (failure) => {
    const f = fixture()
    try {
      await extractPDF(f.options, f.storage, quiet)
      const manifest = readExtractionManifest(f.bookDir)!
      const file = path.join(f.bookDir, "extraction.json")
      const asset = path.join(f.bookDir, manifest.assets[0].path)
      if (failure === "missing") fs.unlinkSync(asset)
      if (failure === "corrupt") fs.writeFileSync(asset, "damaged")
      if (failure === "contract") manifest.inputs.contractVersion++
      if (failure === "incomplete") manifest.status = "extracting"
      if (failure === "zero-pages") manifest.pages = []
      if (failure === "truncated-inventory") manifest.assets = manifest.assets.slice(1)
      if (["contract", "incomplete", "zero-pages", "truncated-inventory"].includes(failure)) fs.writeFileSync(file, JSON.stringify(manifest))
      if (failure === "legacy") fs.unlinkSync(file)
      const before = bytes(f.bookDir)
      await expect(extractPDF(f.options, f.storage, quiet)).rejects.toThrow(/EXTRACTION_(ASSETS_INVALID|INPUTS_CHANGED|INCOMPLETE|LEGACY)/)
      expect(bytes(f.bookDir)).toEqual(before)
    } finally { f.storage.close() }
  })

  it("retains a failed/cancelled attempt and refuses restart without clearing partial output", async () => {
    const f = fixture()
    const controller = new AbortController()
    const put = f.storage.putExtractedPage.bind(f.storage)
    f.storage.putExtractedPage = (page) => { put(page); controller.abort() }
    try {
      await expect(extractPDF({ ...f.options, signal: controller.signal }, f.storage, quiet)).rejects.toThrow()
      expect(readExtractionManifest(f.bookDir)?.status).toBe("failed")
      expect(f.storage.getPages()).toHaveLength(1)
      expect(() => assertExtractionReadable(f.bookDir)).toThrow("EXTRACTION_INCOMPLETE")
      const before = bytes(f.bookDir)
      await expect(extractPDF(f.options, f.storage, quiet)).rejects.toThrow("EXTRACTION_INCOMPLETE")
      expect(bytes(f.bookDir)).toEqual(before)
    } finally { f.storage.close() }
  })

  it("extracts its stored snapshot even if the external source changes during the attempt", async () => {
    const f = fixture()
    try {
      const external = path.join(f.booksRoot, "source.pdf")
      fs.copyFileSync(pdf, external)
      const original = extractionHash(fs.readFileSync(external))
      await extractPDF({ ...f.options, pdfPath: external }, f.storage, { emit(event) {
        if (event.type === "step-start") fs.writeFileSync(external, "source replaced")
      } })
      expect(readExtractionManifest(f.bookDir)).toMatchObject({ status: "complete", sourceHash: original })
      expect(extractionHash(fs.readFileSync(path.join(f.bookDir, "book.pdf")))).toBe(original)
    } finally { f.storage.close() }
  })

  it("blocks the actual full DAG and CLI with no transport calls or content mutation after reuse", async () => {
    const f = fixture()
    try {
      await extractPDF(f.options, f.storage, quiet)
      const before = bytes(f.bookDir)
      const transport = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Provider transport must not run"))
      await expect(runFullPipeline({ label: "book", booksRoot: f.booksRoot, ...f.options, configPath: path.join(root, "config.yaml"), promptsDir: path.join(root, "prompts"), templatesDir: path.join(root, "templates") })).rejects.toMatchObject({ code: "UNSAFE_RESUME_UNAVAILABLE" })
      expect(transport).not.toHaveBeenCalled()
      const cli = spawnSync(process.execPath, [path.join(root, "packages/pipeline/dist/cli.js"), "book", pdf, "--books-dir", f.booksRoot, "--start-page", "1", "--end-page", "1"], { cwd: root, encoding: "utf8" })
      expect(cli.status).not.toBe(0)
      expect(cli.stderr).toContain("UNSAFE_RESUME_UNAVAILABLE")
      expect(bytes(f.bookDir)).toEqual(before)
    } finally { f.storage.close() }
  })

  it("a process killed during extraction leaves an incomplete attempt, never an assumed completion", () => {
    const f = fixture()
    f.storage.close()
    const storageUrl = pathToFileURL(path.join(root, "packages/storage/dist/index.js")).href
    const extractUrl = pathToFileURL(path.join(root, "packages/pipeline/dist/pdf-extraction.js")).href
    const child = spawnSync(process.execPath, ["--input-type=module", "-e", `
      import { createBookStorage } from ${JSON.stringify(storageUrl)};
      import { extractPDF } from ${JSON.stringify(extractUrl)};
      const storage = createBookStorage('book', ${JSON.stringify(f.booksRoot)});
      await extractPDF({pdfPath:${JSON.stringify(pdf)}, endPage:3}, storage, {emit(e) {
        if(e.type === 'step-progress' && e.page === 2) process.kill(process.pid, 'SIGKILL');
      }});
    `], { encoding: "utf8" })
    expect(child.signal).toBe("SIGKILL")
    expect(readExtractionManifest(f.bookDir)?.status).toBe("extracting")
    const before = bytes(f.bookDir)
    expect(() => withBookWriter(f.bookDir, () => prepareExtractionAdmission(f.bookDir, f.options))).toThrow("EXTRACTION_INCOMPLETE")
    expect(bytes(f.bookDir)).toEqual(before)
  })

  it("keeps a real validated LLM cache reusable across admission, counting backend transport calls", async () => {
    const f = fixture()
    let calls = 0
    const registry = createProviderRegistry().register({
      manifest: { id: "fixture", displayName: "Fixture", modalities: ["structured-text"], credentialFields: [], capabilities: { "structured-text": { strategies: ["native-schema"], recursiveSchemas: true, imageInput: false, temperature: true } }, defaultModels: { "structured-text": "model" } },
      credentialSchema: z.object({}),
      cacheFingerprint: () => ({ adapterVersion: "fixture-v1" }),
      createStructuredTextBackend: () => ({ async generateStructured<T>() { calls++; return { object: { ok: true } as T, usage: { inputTokens: 1, outputTokens: 1 } } } }),
    }).freeze()
    try {
      await extractPDF(f.options, f.storage, quiet)
      const model = createLLMModel({ modelId: "fixture:model", registry, cacheDir: path.join(f.bookDir, ".cache"), logLevel: "silent" })
      const input = { schema: z.object({ ok: z.boolean() }), messages: [{ role: "user" as const, content: "unchanged ordered input" }] }
      expect((await model.generateObject(input)).cached).toBe(false)
      expect(await extractPDF(f.options, f.storage, quiet)).toBe("reused")
      expect((await model.generateObject(input)).cached).toBe(true)
      expect(calls).toBe(1)
    } finally { f.storage.close() }
  })

  it.each(["attempt", "snapshot", "assets"])("retains safe state when publication fails at %s", async (boundary) => {
    const f = fixture()
    const write = fs.writeFileSync.bind(fs)
    const fsync = fs.fsyncSync.bind(fs)
    const open = fs.openSync.bind(fs)
    const assetFds = new Set<number>()
    vi.spyOn(fs, "openSync").mockImplementation((file, flags, mode) => {
      const fd = open(file, flags, mode)
      if (String(file).includes(`${path.sep}images${path.sep}`) && flags === "r+") assetFds.add(fd)
      return fd
    })
    let failOnce = true
    vi.spyOn(fs, "writeFileSync").mockImplementation((file, data, options) => {
      const initialAttempt = typeof file === "number" && String(data).includes('"status": "extracting"')
      if (failOnce && ((boundary === "attempt" && initialAttempt) || (boundary === "snapshot" && String(file).endsWith("book.pdf")))) {
        failOnce = false
        throw new Error("Injected boundary failure")
      }
      return write(file, data, options)
    })
    vi.spyOn(fs, "fsyncSync").mockImplementation((fd) => {
      if (boundary === "assets" && assetFds.has(fd) && failOnce) {
        failOnce = false
        throw new Error("Injected boundary failure")
      }
      fsync(fd)
    })
    try {
      await expect(extractPDF(f.options, f.storage, quiet)).rejects.toThrow("Injected boundary failure")
      expect(readExtractionManifest(f.bookDir)?.status).not.toBe("complete")
      if (boundary !== "assets") expect(f.storage.getPages()).toHaveLength(0)
      const before = bytes(f.bookDir)
      await expect(extractPDF(f.options, f.storage, quiet)).rejects.toThrow(/EXTRACTION_(INCOMPLETE|LEGACY)/)
      expect(bytes(f.bookDir)).toEqual(before)
    } finally { f.storage.close() }
  })

  it("does not publish completion when the final manifest rename fails", async () => {
    const f = fixture()
    const rename = fs.renameSync.bind(fs)
    let rejected = false
    vi.spyOn(fs, "renameSync").mockImplementation((from, to) => {
      if (!rejected && String(from).endsWith("extraction.json.pending") && JSON.parse(fs.readFileSync(from, "utf8")).status === "complete") {
        rejected = true
        throw new Error("Injected publication failure")
      }
      rename(from, to)
    })
    const events = vi.fn()
    try {
      await expect(extractPDF(f.options, f.storage, { emit: events })).rejects.toThrow("Injected publication failure")
      expect(readExtractionManifest(f.bookDir)?.status).toBe("failed")
      expect(f.storage.getPages()).toHaveLength(1)
      expect(events.mock.calls.some(([event]) => event.type === "step-complete")).toBe(false)
      await expect(extractPDF(f.options, f.storage, quiet)).rejects.toThrow("EXTRACTION_INCOMPLETE")
    } finally { f.storage.close() }
  })
})
