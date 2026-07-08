import path from "node:path"
import fs from "node:fs"
import { Hono } from "hono"
import {
  promptNameForModel,
  resolvePromptModelId,
} from "@adt/llm"

const VALID_NAME = /^[a-zA-Z0-9_]+$/
const PROMPT_VERSIONS_DIR = ".versions"

export function createPromptRoutes(promptsDir: string, booksDir: string) {
  const app = new Hono()
  const templatesDir = path.join(path.dirname(promptsDir), "templates")

  // GET /prompts/:name — read global prompt template content
  app.get("/prompts/:name", (c) => {
    const name = c.req.param("name")
    if (!VALID_NAME.test(name)) {
      return c.json({ error: "Invalid prompt name" }, 400)
    }
    const modelId = resolvePromptModelId(c.req.query("model"))

    const prompt = readPrompt({ promptsDir, name, modelId })
    if (!prompt) {
      return c.json({ error: "Prompt not found" }, 404)
    }

    return c.json(prompt)
  })

  // PUT /prompts/:name — update global prompt template content
  app.put("/prompts/:name", async (c) => {
    const name = c.req.param("name")
    if (!VALID_NAME.test(name)) {
      return c.json({ error: "Invalid prompt name" }, 400)
    }
    const modelId = resolvePromptModelId(c.req.query("model"))

    const body = await c.req.json<{ content: string }>()
    if (typeof body.content !== "string") {
      return c.json({ error: "Missing content field" }, 400)
    }

    const basePath = path.join(promptsDir, `${name}.liquid`)
    if (!fs.existsSync(basePath)) {
      return c.json({ error: "Prompt not found" }, 404)
    }

    const resolvedName = promptNameForModel(name, modelId)
    const filePath = path.join(promptsDir, `${resolvedName}.liquid`)
    fs.writeFileSync(filePath, body.content, "utf-8")
    return c.json({ name, resolvedName, content: body.content, source: "global", modelId })
  })

  // GET /books/:label/prompts/:name — read book override, fall back to global
  app.get("/books/:label/prompts/:name", (c) => {
    const label = c.req.param("label")
    const name = c.req.param("name")
    if (!VALID_NAME.test(name)) {
      return c.json({ error: "Invalid prompt name" }, 400)
    }
    const modelId = resolvePromptModelId(c.req.query("model"))

    const prompt = readPrompt({ promptsDir, booksDir, label, name, modelId })
    if (!prompt) {
      return c.json({ error: "Prompt not found" }, 404)
    }

    return c.json(prompt)
  })

  // PUT /books/:label/prompts/:name — save book-level override
  app.put("/books/:label/prompts/:name", async (c) => {
    const label = c.req.param("label")
    const name = c.req.param("name")
    if (!VALID_NAME.test(name)) {
      return c.json({ error: "Invalid prompt name" }, 400)
    }
    const modelId = resolvePromptModelId(c.req.query("model"))

    const body = await c.req.json<{ content: string }>()
    if (typeof body.content !== "string") {
      return c.json({ error: "Missing content field" }, 400)
    }

    // Verify the prompt exists globally (so we don't create random files)
    const globalPath = path.join(promptsDir, `${name}.liquid`)
    if (!fs.existsSync(globalPath)) {
      return c.json({ error: "Prompt not found" }, 404)
    }

    // Write an immutable book-level prompt version. Existing flat overrides are
    // still read for compatibility, but new saves are versioned.
    const bookPromptsDir = path.join(booksDir, label, "prompts")
    const resolvedName = promptNameForModel(name, modelId)
    const versionDir = path.join(bookPromptsDir, PROMPT_VERSIONS_DIR, resolvedName)
    fs.mkdirSync(versionDir, { recursive: true })
    const version = createPromptVersionName(versionDir)
    fs.writeFileSync(path.join(versionDir, version), body.content, "utf-8")
    return c.json({ name, resolvedName, content: body.content, source: "book", modelId, version })
  })

  // --- Render templates (Liquid layout templates used by template-based strategies) ---

  // GET /templates — list available template names
  app.get("/templates", (c) => {
    if (!fs.existsSync(templatesDir)) {
      return c.json({ templates: [] })
    }
    const files = fs.readdirSync(templatesDir)
    const names = files
      .filter((f) => f.endsWith(".liquid"))
      .map((f) => f.replace(/\.liquid$/, ""))
    return c.json({ templates: names })
  })

  // GET /templates/:name — read global template
  app.get("/templates/:name", (c) => {
    const name = c.req.param("name")
    if (!VALID_NAME.test(name)) {
      return c.json({ error: "Invalid template name" }, 400)
    }

    const filePath = path.join(templatesDir, `${name}.liquid`)
    if (!fs.existsSync(filePath)) {
      return c.json({ error: "Template not found" }, 404)
    }

    const content = fs.readFileSync(filePath, "utf-8")
    return c.json({ name, content })
  })

  // PUT /templates/:name — update global template
  app.put("/templates/:name", async (c) => {
    const name = c.req.param("name")
    if (!VALID_NAME.test(name)) {
      return c.json({ error: "Invalid template name" }, 400)
    }

    const body = await c.req.json<{ content: string }>()
    if (typeof body.content !== "string") {
      return c.json({ error: "Missing content field" }, 400)
    }

    const filePath = path.join(templatesDir, `${name}.liquid`)
    if (!fs.existsSync(filePath)) {
      return c.json({ error: "Template not found" }, 404)
    }

    fs.writeFileSync(filePath, body.content, "utf-8")
    return c.json({ name, content: body.content })
  })

  // GET /books/:label/templates/:name — read book override, fall back to global
  app.get("/books/:label/templates/:name", (c) => {
    const label = c.req.param("label")
    const name = c.req.param("name")
    if (!VALID_NAME.test(name)) {
      return c.json({ error: "Invalid template name" }, 400)
    }

    const bookPath = path.join(booksDir, label, "templates", `${name}.liquid`)
    if (fs.existsSync(bookPath)) {
      const content = fs.readFileSync(bookPath, "utf-8")
      return c.json({ name, content, source: "book" })
    }

    const globalPath = path.join(templatesDir, `${name}.liquid`)
    if (!fs.existsSync(globalPath)) {
      return c.json({ error: "Template not found" }, 404)
    }

    const content = fs.readFileSync(globalPath, "utf-8")
    return c.json({ name, content, source: "global" })
  })

  // PUT /books/:label/templates/:name — save book-level template override
  app.put("/books/:label/templates/:name", async (c) => {
    const label = c.req.param("label")
    const name = c.req.param("name")
    if (!VALID_NAME.test(name)) {
      return c.json({ error: "Invalid template name" }, 400)
    }

    const body = await c.req.json<{ content: string }>()
    if (typeof body.content !== "string") {
      return c.json({ error: "Missing content field" }, 400)
    }

    const globalPath = path.join(templatesDir, `${name}.liquid`)
    if (!fs.existsSync(globalPath)) {
      return c.json({ error: "Template not found" }, 404)
    }

    const bookTemplatesDir = path.join(booksDir, label, "templates")
    fs.mkdirSync(bookTemplatesDir, { recursive: true })
    const bookPath = path.join(bookTemplatesDir, `${name}.liquid`)
    fs.writeFileSync(bookPath, body.content, "utf-8")
    return c.json({ name, content: body.content, source: "book" })
  })

  return app
}

function readPrompt(options: {
  promptsDir: string
  booksDir?: string
  label?: string
  name: string
  modelId: string | null
}): {
  name: string
  resolvedName: string
  content: string
  source: "book" | "global"
  modelId: string | null
  version?: string
} | null {
  const { promptsDir, booksDir, label, name, modelId } = options
  const resolvedName = promptNameForModel(name, modelId)
  if (resolvedName !== name) {
    const variant = readBasePrompt({ promptsDir, booksDir, label, name: resolvedName, modelId })
    if (variant) {
      return { ...variant, name, resolvedName }
    }
  }

  return readBasePrompt({ promptsDir, booksDir, label, name, modelId: null })
}

function readBasePrompt(options: {
  promptsDir: string
  booksDir?: string
  label?: string
  name: string
  modelId: string | null
}): {
  name: string
  resolvedName: string
  content: string
  source: "book" | "global"
  modelId: string | null
  version?: string
} | null {
  const { promptsDir, booksDir, label, name, modelId } = options
  if (booksDir && label) {
    const bookPrompt = readPromptFromRoot(path.join(booksDir, label, "prompts"), name)
    if (bookPrompt) {
      return {
        name,
        resolvedName: name,
        content: bookPrompt.content,
        source: "book",
        modelId,
        version: bookPrompt.version,
      }
    }
  }

  const globalPrompt = readPromptFromRoot(promptsDir, name)
  if (globalPrompt) {
    return {
      name,
      resolvedName: name,
      content: globalPrompt.content,
      source: "global",
      modelId,
      version: globalPrompt.version,
    }
  }

  return null
}

function readPromptFromRoot(
  root: string,
  promptName: string,
): { content: string; version?: string } | null {
  const version = latestVersionFile(root, promptName)
  if (version) {
    return {
      content: fs.readFileSync(path.join(root, PROMPT_VERSIONS_DIR, promptName, version), "utf-8"),
      version,
    }
  }

  const flatPath = path.join(root, `${promptName}.liquid`)
  if (!fs.existsSync(flatPath)) return null
  return { content: fs.readFileSync(flatPath, "utf-8") }
}

function latestVersionFile(root: string, promptName: string): string | null {
  const versionDir = path.join(root, PROMPT_VERSIONS_DIR, promptName)
  if (!fs.existsSync(versionDir)) return null

  const versions = fs
    .readdirSync(versionDir)
    .filter((file) => file.endsWith(".liquid"))
    .sort()
  return versions.at(-1) ?? null
}

function createPromptVersionName(versionDir: string): string {
  const timestamp = new Date().toISOString().replace(/[-:]/g, "").replace(".", "")
  for (let index = 0; index < 1000; index += 1) {
    const candidate = `${timestamp}-${String(index).padStart(3, "0")}.liquid`
    if (!fs.existsSync(path.join(versionDir, candidate))) return candidate
  }
  throw new Error("Unable to create unique prompt version name")
}
