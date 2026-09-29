import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, expect, it, vi } from "vitest"
import { createBookStorage, openBookDb } from "@adt/storage"
import { promptRoots } from "@adt/llm"
import { createPromptRoutes } from "../routes/prompts.js"
import { createStageRunner } from "./stage-runner.js"
import { reRenderPage } from "./page-edit-service.js"
import { renderSyntheticActivity } from "../../../../packages/agents/src/tools/render-section.js"

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })
it.each(["stage", "targeted", "agent"])("%s uses the editor-selected prompt at the provider boundary and logs the captured bytes", async (kind) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "prompt-generation-"))
  const bundled = path.join(root, "resources", "prompts"), books = path.join(root, "books"), global = path.join(root, "global")
  const config = path.join(root, "config.yaml")
  fs.mkdirSync(bundled, { recursive: true })
  fs.writeFileSync(config, "default_model: openai:gpt-4o\nrole_types: {}\nstructure_types: {}\nsection_types: {}\nglossary:\n  prompt: test\n  max_retries: 0\ndefault_render_strategy: llm\nrender_strategies:\n  llm:\n    render_type: llm\n    config:\n      prompt: test\n      max_retries: 0\n")
  fs.writeFileSync(path.join(bundled, "test.liquid"), '{% chat role: "user" %}bundled{% endchat %}')
  const section = { sectionId: "pg001_sec001", sectionType: "content", backgroundColor: "#ffffff", textColor: "#000000", pageNumber: 1, isPruned: false, nodes: [{ nodeId: "t1", role: "section_text", text: "original", isPruned: false }] }
  const storage = createBookStorage("book", books)
  const image = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=", "base64")
  storage.putExtractedPage({ pageId: "pg001", pageNumber: 1, text: "original", pageImage: { imageId: "pg001_page", buffer: image, format: "png", hash: "page", width: 1, height: 1 }, images: [] })
  storage.putNodeData("page-sectioning", "pg001", { reasoning: "fixture", sections: [section] })
  storage.putNodeData("web-rendering", "pg001", { sections: [{ sectionIndex: 0, sectionType: "content", reasoning: "fixture", html: '<section data-section-id="pg001_sec001"><p data-id="t1">original</p></section>' }] })
  storage.close()
  const requests: string[] = []
  vi.stubEnv("PROMPT_OVERRIDES_DIR", global)
  vi.stubGlobal("fetch", vi.fn(async (_url: unknown, init: RequestInit) => {
    requests.push(String(init.body))
    return new Response(JSON.stringify({ error: { message: "controlled transport failure", type: "invalid_request_error", code: "invalid_request" } }), { status: 400, headers: { "content-type": "application/json" } })
  }))
  try {
    const api = createPromptRoutes(bundled, books, config, global)
    const url = "/books/book/prompts/test?model=openai:gpt-4o"
    const loaded = await (await api.request(url)).json()
    const content = `{% chat role: "user" %}selected ${kind} {% include "_shared" %}{% endchat %}`
    const saved = await api.request(url, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ revision: loaded.revision, content }) })
    expect(saved.status).toBe(200)
    fs.writeFileSync(path.join(global, "_shared.liquid"), "shared bytes")
    expect(requests).toHaveLength(0) // Save itself starts no generation.
    const credentials = { openai: { apiKey: "test-key" } }
    if (kind === "stage") {
      await createStageRunner().run("book", { booksDir: books, promptsDir: bundled, configPath: config, credentials, fromStage: "glossary", toStage: "glossary" }, { emit: () => {} }).catch(() => {})
    } else if (kind === "targeted") {
      await reRenderPage({ label: "book", pageId: "pg001", sectionIndex: 0, booksDir: books, promptsDir: bundled, configPath: config, credentials }).catch(() => {})
    } else {
      const reopened = createBookStorage("book", books)
      try {
        await renderSyntheticActivity({ storage: reopened, bookLabel: "book", booksDir: books, promptRoots: promptRoots(books, bundled, global, path.join(books, "book", "prompts")), configPath: config, anchorPageId: "pg001", sectionIndex: 0, sectionId: "pg001_sec001", sectionType: "content", nodes: section.nodes, credentials }).catch(() => {})
      } finally { reopened.close() }
    }
    expect(requests).toHaveLength(1)
    expect(requests[0]).toContain(`selected ${kind} shared bytes`)
    const db = openBookDb(path.join(books, "book", "book.db"))
    try {
      const logs = db.all("SELECT data FROM llm_log")
      expect(JSON.stringify(logs)).toContain(`selected ${kind} shared bytes`)
      expect(db.all("SELECT text FROM pages")).toEqual([{ text: "original" }])
    } finally { db.close() }
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
}, 20000)
