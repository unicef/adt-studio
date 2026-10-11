import { afterEach, expect, it } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createBookStorage, withBookWriter } from "@adt/storage"
import { classifyStoredSectioning, loadBookConfig, readGenerationCatalog, stampGeneratedRendering } from "@adt/pipeline"
import type { PageSectioningOutput } from "@adt/types"
import { saveStoryboard } from "./storyboard-save.js"

let root: string
afterEach(() => { if (root) fs.rmSync(root, { recursive: true, force: true }) })

it("does not certify changed render configuration by patching source text", () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "sync-provenance-review-"))
  const label = "book", pageId = "pg001", sectionId = "pg001_sec001"
  const configPath = path.join(root, "config.yaml")
  fs.writeFileSync(configPath, "structure_types: {}\nrole_types: {}\ndefault_model: openai:gpt-4o-mini\ndefault_render_strategy: llm\nrender_strategies:\n  llm:\n    render_type: llm\n    config:\n      prompt: web_generation_html\n")
  const db = createBookStorage(label, root)
  try {
    db.putExtractedPage({ pageId, pageNumber: 1, text: "Old", images: [], pageImage: { imageId: "pg001_page", buffer: Buffer.from("image"), format: "png", hash: "image", width: 100, height: 100 } })
    const source: PageSectioningOutput = { reasoning: "", sections: [{ sectionId, sectionType: "text", backgroundColor: "#fff", textColor: "#000", pageNumber: 1, isPruned: false, nodes: [{ nodeId: "text-1", role: "text", text: "Old", isPruned: false }] }] }
    db.putNodeData("page-sectioning", pageId, source)
    const rendering = stampGeneratedRendering({ sections: [{ sectionIndex: 0, sectionType: "text", reasoning: "", html: `<section data-section-id="${sectionId}" data-section-type="text"><p data-id="text-1">Old</p></section>` }] }, source, pageId, 1)
    db.putNodeData("web-rendering", pageId, rendering)
    const generation = { bookDir: db.bookDir!, promptsDir: path.resolve("prompts"), configPath }
    const status = () => readGenerationCatalog({ ...generation, storage: db, config: loadBookConfig(label, root, configPath) }).find((s) => s.identity.kind === "storyboard")!
    const before = status()
    db.putNodeData("web-rendering", pageId, { ...rendering, generationEvidence: { source: "ai", input: { signature: before.signature, contentHash: before.contentHash, references: [] } } })
    expect(status().current).toBe(true)
    fs.writeFileSync(configPath, fs.readFileSync(configPath, "utf8").replace("openai:gpt-4o-mini", "openai:gpt-4o"))
    expect(status().updateNeeded).toBe(true)
    const edited = structuredClone(source)
    edited.sections[0].nodes[0].text = "New"
    withBookWriter(db.bookDir!, () => saveStoryboard(db, pageId, { sectioning: edited, baseVersion: 1, renderingVersion: 2 }, loadBookConfig(label, root, configPath), undefined, generation))
    expect(status().current).toBe(false)
    expect(status().updateNeeded).toBe(true)
  } finally { db.close() }
})

it.each(["activity_custom", "activity_custom_matching"])("keeps %s structural drift out of generic targeted repair", (sectionType) => {
  const pageId = "pg001", sectionId = "pg001_sec001"
  const source: PageSectioningOutput = { reasoning: "", sections: [{ sectionId, sectionType, backgroundColor: "#fff", textColor: "#000", pageNumber: 1, isPruned: false, nodes: [{ nodeId: "text-1", role: "text", text: "Old", isPruned: false }] }] }
  const rendering = stampGeneratedRendering({ sections: [{ sectionIndex: 0, sectionType, reasoning: "", html: `<section data-section-id="${sectionId}" data-section-type="${sectionType}"><p data-id="text-1">Old</p><script>window.customGrader = () => 42</script></section>` }] }, source, pageId, 1)
  const changed = structuredClone(source)
  changed.sections[0].nodes.push({ nodeId: "text-2", role: "text", text: "Added", isPruned: false })
  const result = classifyStoredSectioning({ pageId, source: { data: changed, version: 2 }, rendering: { data: rendering, version: 1 }, history: [{ data: source, version: 1 }, { data: changed, version: 2 }], layout: "reflowable", sectionOwners: { [sectionId]: [pageId] } })
  expect(result.sections).toMatchObject([{ sectionId, status: "structural-drift", action: "review" }])
  expect(result.rendering).toEqual(rendering)
})
