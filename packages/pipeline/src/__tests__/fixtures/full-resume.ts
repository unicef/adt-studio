import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { vi } from "vitest"
import { createBookStorage } from "@adt/storage"
import { runFullPipeline } from "../../pipeline-dag.js"
export function setupFullResumeFixture() {
const repository = path.resolve(import.meta.dirname, "../../../../..")
let root: string
const label = "book"
const transport = vi.fn<typeof fetch>()
const options = () => ({ label, booksRoot: path.join(root, "books"), pdfPath: path.join(repository, "tests/fixtures/raven.pdf"),
  configPath: path.join(root, "config.yaml"), configDir: path.join(root, "config"), promptsDir: path.join(root, "prompts"), templatesDir: path.join(repository, "templates"),
  fromStage: "extract" as const, toStage: "storyboard" as const })
const storage = () => createBookStorage(label, options().booksRoot)
function errors(result: Awaited<ReturnType<typeof runFullPipeline>>) { return [...result.stages.errors.values()].map((error) => error.message) }
function histories() { const s = storage(); try { return s.getNodeVersionFingerprint() } finally { s.close() } }

  vi.stubEnv("OPENAI_API_KEY", "fixture-only")
  root = fs.mkdtempSync(path.join(os.tmpdir(), "full-resume-"))
  fs.mkdirSync(path.join(root, "prompts")); fs.mkdirSync(path.join(root, "config"))
  fs.writeFileSync(options().configPath, `default_model: ollama:tinyllama
start_page: 1
end_page: 1
concurrency: 1
structure_types: { paragraph: Paragraph }
role_types: { text: Text }
section_types: { text_only: Text }
page_sectioning: { mode: page, max_refinements: 0 }
image_filters: { meaningfulness: false, cropping: false, segmentation: false, min_side: 99999 }
default_render_strategy: fixture
render_strategies:
  fixture:
    render_type: template
    config: { template: one_column_render }
quiz_generation: { quiz_section_types: [] }
`)
  for (const name of ["metadata_extraction", "book_summary", "book_outline", "page_sectioning", "glossary", "core_tts_preparation"]) fs.writeFileSync(path.join(root, "prompts", `${name}.liquid`), `{% chat role: "user" %}${name}{% endchat %}`)
  transport.mockReset().mockImplementation(async (_url, init) => {
    if (String(_url).includes("audio/speech")) return new Response(new Uint8Array([73, 68, 51, 4, 0, 0, 0, 0, 0, 0]))
    const body = JSON.parse(String(init?.body)), prompt = JSON.stringify(body.messages)
    let object: unknown
    if (prompt.includes("metadata_extraction")) object = { title: "Raven", authors: [], publisher: null, language_code: "en", cover_page_number: 1, reasoning: "fixture" }
    else if (prompt.includes("book_summary")) object = { summary: "A raven visits." }
    else if (prompt.includes("book_outline")) object = { reasoning: "fixture", entries: [], styleClusters: [] }
    else if (prompt.includes("page_sectioning")) object = { reasoning: "fixture", sections: [{ section_type: "text_only", background_color: "#ffffff", text_color: "#000000", page_number: 1, nodes: [{ role: "text", text: "A raven visits." }] }] }
    else if (prompt.includes("glossary")) object = { reasoning: "fixture", items: [] }
    else throw new Error(`Unexpected provider request: ${prompt.slice(0, 120)}`)
    return Response.json({ id: "fixture", object: "chat.completion", created: 0, model: "fixture", choices: [{ index: 0, message: { role: "assistant", content: JSON.stringify(object) }, finish_reason: "stop" }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } })
  })
  vi.stubGlobal("fetch", transport)
return { root, transport, options, storage, histories, errors }
}
