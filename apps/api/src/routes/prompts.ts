import path from "node:path"
import fs from "node:fs"
import { Hono } from "hono"
import {
  promptNameForModel,
  resolvePromptModelId,
} from "@adt/llm"

const VALID_NAME = /^[a-zA-Z0-9_]+$/
const VALID_MODEL_ID = /^[a-zA-Z0-9][a-zA-Z0-9_.:/-]{0,159}$/
const PROMPT_VERSIONS_DIR = ".versions"
const PROMPT_MODELS_FILE = ".models.json"
const PROMPT_VERSION_FILE_LIMIT = 6

interface PromptSummary {
  name: string
  variants: string[]
}

export function createPromptRoutes(promptsDir: string, booksDir: string) {
  const app = new Hono()
  const templatesDir = path.join(path.dirname(promptsDir), "templates")

  // GET /prompt-models - list additional globally configured prompt model IDs
  app.get("/prompt-models", (c) => {
    return c.json({ models: readPromptModels(promptsDir) })
  })

  // PUT /prompt-models - replace additional globally configured prompt model IDs
  app.put("/prompt-models", async (c) => {
    const body = await c.req.json<{ models?: unknown }>()
    if (!Array.isArray(body.models)) {
      return c.json({ error: "Missing models array" }, 400)
    }

    const models: string[] = []
    for (const value of body.models) {
      if (typeof value !== "string") {
        return c.json({ error: "Invalid model id" }, 400)
      }
      const modelId = normalizePromptModelId(value)
      if (!modelId) continue
      if (!VALID_MODEL_ID.test(modelId)) {
        return c.json({ error: "Invalid model id" }, 400)
      }
      if (!models.includes(modelId)) models.push(modelId)
    }

    writePromptModels(promptsDir, models)
    return c.json({ models })
  })

  // GET /prompts - list global prompt template names and model variants
  app.get("/prompts", (c) => {
    return c.json({ prompts: listPrompts(promptsDir) })
  })

  // GET /prompts/:name - read global prompt template content
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

  // PUT /prompts/:name - update global prompt template content
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

    if (!basePromptExists(promptsDir, name)) {
      return c.json({ error: "Prompt not found" }, 404)
    }

    const resolvedName = promptNameForModel(name, modelId)
    const versionDir = path.join(promptsDir, PROMPT_VERSIONS_DIR, resolvedName)
    fs.mkdirSync(versionDir, { recursive: true })
    const version = createPromptVersionName(versionDir)
    fs.writeFileSync(path.join(versionDir, version), body.content, "utf-8")
    prunePromptVersions(versionDir)
    return c.json({ name, resolvedName, content: body.content, source: "global", modelId, version })
  })

  // DELETE /prompts/:name - reset global prompt to its shipped flat-file default
  app.delete("/prompts/:name", (c) => {
    const name = c.req.param("name")
    if (!VALID_NAME.test(name)) {
      return c.json({ error: "Invalid prompt name" }, 400)
    }
    const modelId = resolvePromptModelId(c.req.query("model"))

    if (!basePromptExists(promptsDir, name)) {
      return c.json({ error: "Prompt not found" }, 404)
    }

    const resolvedName = promptNameForModel(name, modelId)
    const versionDir = path.join(promptsDir, PROMPT_VERSIONS_DIR, resolvedName)
    if (fs.existsSync(versionDir)) {
      fs.rmSync(versionDir, { recursive: true, force: true })
    }

    const prompt = readPrompt({ promptsDir, name, modelId })
    if (!prompt) {
      return c.json({ error: "Prompt not found" }, 404)
    }

    return c.json(prompt)
  })

  // GET /books/:label/prompts/:name - read book override, fall back to global
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

  // PUT /books/:label/prompts/:name - save book-level override
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
    prunePromptVersions(versionDir)
    return c.json({ name, resolvedName, content: body.content, source: "book", modelId, version })
  })

  // --- Render templates (Liquid layout templates used by template-based strategies) ---

  // GET /templates - list available template names
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

  // GET /templates/:name - read global template
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

  // PUT /templates/:name - update global template
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

  // GET /books/:label/templates/:name - read book override, fall back to global
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

  // PUT /books/:label/templates/:name - save book-level template override
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

function listPrompts(promptsDir: string): PromptSummary[] {
  const names = new Set<string>()
  const variantMap = new Map<string, Set<string>>()

  if (fs.existsSync(promptsDir)) {
    for (const file of fs.readdirSync(promptsDir, { withFileTypes: true })) {
      if (!file.isFile() || !file.name.endsWith(".liquid")) continue
      const name = file.name.replace(/\.liquid$/, "")
      const [baseName] = name.split("__")
      if (!baseName) continue
      if (name.includes("__")) {
        if (!variantMap.has(baseName)) variantMap.set(baseName, new Set())
        variantMap.get(baseName)!.add(name)
      } else {
        names.add(name)
      }
    }

    const rootPromptNames = new Set(names)
    for (const entry of fs.readdirSync(promptsDir, { withFileTypes: true })) {
      if (!entry.isDirectory() || !isPromptModelFolder(entry.name)) continue
      for (const file of fs.readdirSync(path.join(promptsDir, entry.name), { withFileTypes: true })) {
        if (!file.isFile() || !file.name.endsWith(".liquid")) continue
        const promptName = file.name.replace(/\.liquid$/, "")
        if (!VALID_NAME.test(promptName) || !rootPromptNames.has(promptName)) continue
        const variantName = `${promptName}__${entry.name}`
        if (!variantMap.has(promptName)) variantMap.set(promptName, new Set())
        variantMap.get(promptName)!.add(variantName)
      }
    }
  }

  const versionsRoot = path.join(promptsDir, PROMPT_VERSIONS_DIR)
  if (fs.existsSync(versionsRoot)) {
    for (const name of fs.readdirSync(versionsRoot)) {
      const [baseName] = name.split("__")
      if (!baseName) continue
      if (name.includes("__")) {
        if (!variantMap.has(baseName)) variantMap.set(baseName, new Set())
        variantMap.get(baseName)!.add(name)
      } else {
        names.add(name)
      }
    }
  }

  return [...names]
    .sort((a, b) => a.localeCompare(b))
    .map((name) => ({
      name,
      variants: [...(variantMap.get(name) ?? new Set<string>())].sort((a, b) => a.localeCompare(b)),
    }))
}

function normalizePromptModelId(value: string): string {
  return value.trim().toLowerCase()
}

function readPromptModels(promptsDir: string): string[] {
  const filePath = path.join(promptsDir, PROMPT_MODELS_FILE)
  if (!fs.existsSync(filePath)) return []

  try {
    const data = JSON.parse(fs.readFileSync(filePath, "utf-8")) as { models?: unknown }
    if (!Array.isArray(data.models)) return []
    const models: string[] = []
    for (const value of data.models) {
      if (typeof value !== "string") continue
      const modelId = normalizePromptModelId(value)
      if (!modelId || !VALID_MODEL_ID.test(modelId) || models.includes(modelId)) continue
      models.push(modelId)
    }
    return models
  } catch {
    return []
  }
}

function writePromptModels(promptsDir: string, models: string[]) {
  fs.mkdirSync(promptsDir, { recursive: true })
  fs.writeFileSync(
    path.join(promptsDir, PROMPT_MODELS_FILE),
    `${JSON.stringify({ models }, null, 2)}\n`,
    "utf-8",
  )
}

function basePromptExists(promptsDir: string, name: string): boolean {
  return fs.existsSync(path.join(promptsDir, `${name}.liquid`))
    || latestVersionFile(promptsDir, name) != null
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
    const variant = readModelPrompt({ promptsDir, booksDir, label, name, resolvedName, modelId })
    if (variant) {
      return { ...variant, name, resolvedName }
    }
  }

  return readBasePrompt({ promptsDir, booksDir, label, name, modelId: null })
}

function readModelPrompt(options: {
  promptsDir: string
  booksDir?: string
  label?: string
  name: string
  resolvedName: string
  modelId: string | null
}): {
  name: string
  resolvedName: string
  content: string
  source: "book" | "global"
  modelId: string | null
  version?: string
} | null {
  const { promptsDir, booksDir, label, name, resolvedName, modelId } = options
  if (booksDir && label) {
    const bookPrompt = readModelPromptFromRoot(path.join(booksDir, label, "prompts"), name, resolvedName, modelId)
    if (bookPrompt) {
      return {
        name,
        resolvedName,
        content: bookPrompt.content,
        source: "book",
        modelId,
        version: bookPrompt.version,
      }
    }
  }

  const globalPrompt = readModelPromptFromRoot(promptsDir, name, resolvedName, modelId)
  if (globalPrompt) {
    return {
      name,
      resolvedName,
      content: globalPrompt.content,
      source: "global",
      modelId,
      version: globalPrompt.version,
    }
  }

  return null
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

function readModelPromptFromRoot(
  root: string,
  promptName: string,
  resolvedName: string,
  modelId: string | null,
): { content: string; version?: string } | null {
  const version = latestVersionFile(root, resolvedName)
  if (version) {
    return {
      content: fs.readFileSync(path.join(root, PROMPT_VERSIONS_DIR, resolvedName, version), "utf-8"),
      version,
    }
  }

  if (modelId) {
    const folderPath = path.join(root, promptModelFolderName(modelId), `${promptName}.liquid`)
    if (fs.existsSync(folderPath)) {
      return { content: fs.readFileSync(folderPath, "utf-8") }
    }
  }

  const legacyFlatPath = path.join(root, `${resolvedName}.liquid`)
  if (fs.existsSync(legacyFlatPath)) {
    return { content: fs.readFileSync(legacyFlatPath, "utf-8") }
  }

  return null
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

function prunePromptVersions(versionDir: string) {
  const versions = fs
    .readdirSync(versionDir)
    .filter((file) => file.endsWith(".liquid"))
    .sort()

  const staleVersions = versions.slice(0, Math.max(0, versions.length - PROMPT_VERSION_FILE_LIMIT))
  for (const version of staleVersions) {
    fs.rmSync(path.join(versionDir, version), { force: true })
  }
}

function isPromptModelFolder(name: string): boolean {
  return name !== PROMPT_VERSIONS_DIR
    && name !== "node_modules"
    && VALID_NAME.test(name)
}

function promptModelFolderName(modelId: string): string {
  return modelId
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
}
