import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { pathToFileURL } from "node:url"
import { afterEach, expect, it, vi } from "vitest"
import { PIPELINE } from "@adt/types"
import { createBookStorage, readSectioningLifecycle, readExtractionManifest, writeSectioningLifecycle } from "@adt/storage"
import { extractPDF } from "../pdf-extraction.js"
import { runFullPipeline } from "../pipeline-dag.js"
import { parseCliArgs } from "../cli-args.js"
import { getRenderSectioning } from "../render-sectioning.js"

const repository = path.resolve(import.meta.dirname, "../../../..")
const pdfPath = path.join(repository, "tests/fixtures/raven.pdf")
const roots: string[] = []
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }) })
const raw = (n: number) => ({ reasoning: "fixture", sections: [{ section_type: "text_only", background_color: "#ffffff", text_color: "#000000", page_number: n,
  nodes: [{ role: "text", text: "Generated replacement" }] }] })
const response = (n: number) => ({ id: "fixture", object: "chat.completion", created: 1, model: "gpt-4o-mini",
  choices: [{ index: 0, message: { role: "assistant", content: JSON.stringify(raw(n)) }, finish_reason: "stop" }],
  usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } })

async function fixture(layout = "fixed", part = false) {
  const booksRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sectioning-resume-")); roots.push(booksRoot)
  const label = "book", bookDir = path.join(booksRoot, label), n = part ? 2 : 1, pageId = `pg00${n}`
  const storage = createBookStorage(label, booksRoot)
  if (part) fs.writeFileSync(path.join(bookDir, "part.json"), JSON.stringify({ adtPart: 1, sourceLabel: "source", title: null, range: { startPage: n, endPage: n }, pageCount: 3, fingerprint: {}, identityHash: "i", semanticsHash: "s", createdAt: "now", partLabelSuggestion: "part" }))
  await extractPDF({ pdfPath, startPage: n, endPage: n, fixedLayout: layout === "fixed" }, storage, { emit() {} })
  const configFile = path.join(bookDir, "config.yaml")
  const config = `default_model: openai:gpt-4o-mini\nstart_page: ${n}\nend_page: ${n}\nconcurrency: 1\nstructure_types:\n  paragraph: Paragraph\nrole_types:\n  text: Text\nsection_types:\n  text_only: Text\npage_sectioning:\n  mode: page\n  max_refinements: 0\ndefault_render_strategy: fixture\nrender_strategies:\n  fixture:\n    render_type: ${layout === "fixed" ? "fixed_layout" : "template"}\n    config:\n      template: one_column_render\n`
  fs.writeFileSync(configFile, config)
  storage.putNodeData("metadata", "book", { language_code: "en", title: "Fixture" })
  storage.putNodeData("book-outline", "book", { entries: [], styleClusters: [], reasoning: "fixture" })
  storage.putNodeData("image-filtering", pageId, { images: [] })
  const previous = { reasoning: "manual", source: "manual", sections: [1, 2].map((i) => ({ sectionId: `${pageId}_sec00${i}`, sectionType: "text_only", pageNumber: n, backgroundColor: "white", textColor: "black", isPruned: false, nodes: [] })) }
  storage.putNodeData("page-sectioning", pageId, previous)
  storage.putNodeData("web-rendering", pageId, { sections: [{ sectionIndex: 0, sectionType: "text_only", reasoning: "old", html: "Retained" }] })
  for (const step of PIPELINE.find((stage) => stage.name === "extract")!.steps) storage.markStepCompleted(step.name)
  storage.close()
  writeSectioningLifecycle(bookDir, "page", false)
  const protectedReplacements = [{ node: "page-sectioning" as const, itemId: pageId, version: 1 }]
  const options = { label, booksRoot, pdfPath, promptsDir: path.join(repository, "prompts"), templatesDir: path.join(repository, "templates"), configPath: path.join(repository, "config.yaml"),
    fromStage: "sectioning" as const, toStage: "storyboard" as const, replaceManual: true, protectedReplacements }
  return { booksRoot, bookDir, label, pageId, n, previous, options, configFile }
}

it.each(["fixed", "reflowable", "fixed-part", "reflowable-part"])("verified extraction does not authorize deferred existing-book resume: %s", { timeout: 30_000 }, async (kind) => {
  const f = await fixture(kind.startsWith("fixed") ? "fixed" : "reflowable", kind.endsWith("part"))
  const manifest = fs.readFileSync(path.join(f.bookDir, "extraction.json"))
  const pdf = fs.readFileSync(path.join(f.bookDir, `${f.label}.pdf`))
  const transport = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Unexpected provider call"))
  await expect(runFullPipeline(f.options)).rejects.toThrow("UNSAFE_RESUME_UNAVAILABLE")
  expect(transport).not.toHaveBeenCalled()
  const s = createBookStorage(f.label, f.booksRoot)
  try {
    expect(s.getAllNodeVersions("page-sectioning", f.pageId)).toEqual([{ version: 1, data: f.previous }])
    expect(s.getAllNodeVersions("web-rendering", f.pageId)).toHaveLength(1)
  } finally { s.close() }
  expect(fs.readFileSync(path.join(f.bookDir, "extraction.json"))).toEqual(manifest)
  // Compare every byte without Vitest traversing millions of Buffer properties.
  expect(fs.readFileSync(path.join(f.bookDir, `${f.label}.pdf`)).equals(pdf)).toBe(true)
})

it("the actual CLI refuses verified existing extraction without rewriting output", async () => {
  const f = await fixture()
  const child = spawnSync(process.execPath, [path.join(repository, "packages/pipeline/dist/cli.js"), f.label, pdfPath, "--books-dir", f.booksRoot], {
    encoding: "utf8", timeout: 15000, cwd: repository, env: { PATH: process.env.PATH },
  })
  expect(child.status, child.stderr).toBe(1)
  expect(child.stderr).toContain("UNSAFE_RESUME_UNAVAILABLE")
  expect(child.stderr).not.toContain("Use --from-stage")
  const s = createBookStorage(f.label, f.booksRoot)
  try { expect(s.getAllNodeVersions("page-sectioning", f.pageId)).toEqual([{ version: 1, data: f.previous }]) }
  finally { s.close() }
})

it.each(["--from-stage", "--to-stage", "--protected-replacements"])("does not advertise or accept deferred CLI scope: %s", (flag) => {
  expect(() => parseCliArgs(["book", pdfPath, flag, "sectioning"])).toThrow("Unknown option")
})
