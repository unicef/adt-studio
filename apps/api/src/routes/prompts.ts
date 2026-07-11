import path from "node:path"
import fs from "node:fs"
import { Hono } from "hono"
import {
  promptNameForModel,
  resolvePromptModelId,
} from "@adt/llm"

const VALID_NAME = /^[a-zA-Z0-9_]+$/
const VALID_MODEL_ID = /^[a-zA-Z][a-zA-Z0-9]*:[a-zA-Z0-9][a-zA-Z0-9_.-]{0,159}$/
const PROMPT_VERSIONS_DIR = ".versions"
const PROMPT_MODELS_FILE = ".models.json"
const PROMPT_CURRENT_VERSION_FILE = ".current"
const VALID_VERSION_FILE = /^\d{8}T\d{9}Z-\d{3}\.liquid$/
const BUILT_IN_PROMPT_MODEL_OWNERS = new Map<string, string>([
  ["openai_gpt_5_6_sol", "openai:gpt-5.6-sol"],
  ["openai_gpt_5_5", "openai:gpt-5.5"],
])

interface PromptSummary {
  name: string
  variants: string[]
  variantSources: Record<string, "file" | "version" | "file+version">
}

interface PromptVersionSummary {
  version: string
  createdAt: string | null
  content: string
  isCurrent: boolean
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
    const modelFolders = new Map(BUILT_IN_PROMPT_MODEL_OWNERS)
    for (const value of body.models) {
      if (typeof value !== "string") {
        return c.json({ error: "Invalid model id" }, 400)
      }
      const modelId = normalizePromptModelId(value)
      if (!modelId) continue
      if (!VALID_MODEL_ID.test(modelId)) {
        return c.json({ error: "Invalid model id" }, 400)
      }
      const folderName = promptModelFolderName(modelId)
      const existingModel = modelFolders.get(folderName)
      if (existingModel && existingModel !== modelId) {
        return c.json({ error: "Model id collides with another prompt model" }, 400)
      }
      modelFolders.set(folderName, modelId)
      if (!models.includes(modelId)) models.push(modelId)
    }

    writePromptModels(promptsDir, models)
    return c.json({ models })
  })

  // GET /prompts - list global prompt template names and model variants
  app.get("/prompts", (c) => {
    return c.json({ prompts: listPrompts(promptsDir) })
  })

  // GET /prompts/:name/versions - list versioned global prompt overrides
  app.get("/prompts/:name/versions", (c) => {
    const name = c.req.param("name")
    if (!VALID_NAME.test(name)) {
      return c.json({ error: "Invalid prompt name" }, 400)
    }
    const modelId = resolvePromptModelId(c.req.query("model"))
    if (!isValidPromptModelId(promptsDir, modelId)) {
      return c.json({ error: "Invalid model id" }, 400)
    }

    if (!basePromptExists(promptsDir, name)) {
      return c.json({ error: "Prompt not found" }, 404)
    }

    return c.json(listPromptVersions({ root: promptsDir, promptsDir, name, modelId }))
  })

  // PUT /prompts/:name/versions/:version/current - select active global prompt version
  app.put("/prompts/:name/versions/:version/current", (c) => {
    const name = c.req.param("name")
    const version = c.req.param("version")
    if (!VALID_NAME.test(name)) {
      return c.json({ error: "Invalid prompt name" }, 400)
    }
    if (!VALID_VERSION_FILE.test(version)) {
      return c.json({ error: "Invalid prompt version" }, 400)
    }
    const modelId = resolvePromptModelId(c.req.query("model"))
    if (!isValidPromptModelId(promptsDir, modelId)) {
      return c.json({ error: "Invalid model id" }, 400)
    }

    if (!basePromptExists(promptsDir, name)) {
      return c.json({ error: "Prompt not found" }, 404)
    }

    const resolvedName = promptNameForModel(name, modelId)
    const versionDir = path.join(promptsDir, PROMPT_VERSIONS_DIR, resolvedName)
    const versionPath = path.join(versionDir, version)
    if (!fs.existsSync(versionPath)) {
      return c.json({ error: "Prompt version not found" }, 404)
    }

    writeCurrentPromptVersion(versionDir, version)
    const prompt = readPrompt({ promptsDir, name, modelId })
    if (!prompt) {
      return c.json({ error: "Prompt not found" }, 404)
    }

    return c.json(prompt)
  })

  // GET /prompts/:name - read global prompt template content
  app.get("/prompts/:name", (c) => {
    const name = c.req.param("name")
    if (!VALID_NAME.test(name)) {
      return c.json({ error: "Invalid prompt name" }, 400)
    }
    const modelId = resolvePromptModelId(c.req.query("model"))
    if (!isValidPromptModelId(promptsDir, modelId)) {
      return c.json({ error: "Invalid model id" }, 400)
    }

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
    if (!isValidPromptModelId(promptsDir, modelId)) {
      return c.json({ error: "Invalid model id" }, 400)
    }

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
    writeCurrentPromptVersion(versionDir, version)
    return c.json({ name, resolvedName, content: body.content, source: "global", modelId, version })
  })

  // DELETE /prompts/:name - reset global prompt to its shipped flat-file default
  app.delete("/prompts/:name", (c) => {
    const name = c.req.param("name")
    if (!VALID_NAME.test(name)) {
      return c.json({ error: "Invalid prompt name" }, 400)
    }
    const modelId = resolvePromptModelId(c.req.query("model"))
    if (!isValidPromptModelId(promptsDir, modelId)) {
      return c.json({ error: "Invalid model id" }, 400)
    }

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

  // GET /books/:label/prompts/:name/versions - list versioned book prompt overrides
  app.get("/books/:label/prompts/:name/versions", (c) => {
    const label = c.req.param("label")
    const name = c.req.param("name")
    if (!VALID_NAME.test(name)) {
      return c.json({ error: "Invalid prompt name" }, 400)
    }
    const modelId = resolvePromptModelId(c.req.query("model"))
    if (!isValidPromptModelId(promptsDir, modelId)) {
      return c.json({ error: "Invalid model id" }, 400)
    }

    if (!basePromptExists(promptsDir, name)) {
      return c.json({ error: "Prompt not found" }, 404)
    }

    const bookPromptsDir = path.join(booksDir, label, "prompts")
    return c.json(listPromptVersions({
      root: bookPromptsDir,
      promptsDir,
      booksDir,
      label,
      name,
      modelId,
    }))
  })

  // PUT /books/:label/prompts/:name/versions/:version/current - select active book prompt version
  app.put("/books/:label/prompts/:name/versions/:version/current", (c) => {
    const label = c.req.param("label")
    const name = c.req.param("name")
    const version = c.req.param("version")
    if (!VALID_NAME.test(name)) {
      return c.json({ error: "Invalid prompt name" }, 400)
    }
    if (!VALID_VERSION_FILE.test(version)) {
      return c.json({ error: "Invalid prompt version" }, 400)
    }
    const modelId = resolvePromptModelId(c.req.query("model"))
    if (!isValidPromptModelId(promptsDir, modelId)) {
      return c.json({ error: "Invalid model id" }, 400)
    }

    if (!basePromptExists(promptsDir, name)) {
      return c.json({ error: "Prompt not found" }, 404)
    }

    const resolvedName = promptNameForModel(name, modelId)
    const versionDir = path.join(booksDir, label, "prompts", PROMPT_VERSIONS_DIR, resolvedName)
    const versionPath = path.join(versionDir, version)
    if (!fs.existsSync(versionPath)) {
      return c.json({ error: "Prompt version not found" }, 404)
    }

    writeCurrentPromptVersion(versionDir, version)
    const prompt = readPrompt({ promptsDir, booksDir, label, name, modelId })
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
    if (!isValidPromptModelId(promptsDir, modelId)) {
      return c.json({ error: "Invalid model id" }, 400)
    }

    const prompt = readPrompt({ promptsDir, booksDir, label, name, modelId })
    if (!prompt) {
      return c.json({ error: "Prompt not found" }, 404)
    }

    return c.json(prompt)
  })

  // DELETE /books/:label/prompts/:name - reset book prompt override to global fallback
  app.delete("/books/:label/prompts/:name", (c) => {
    const label = c.req.param("label")
    const name = c.req.param("name")
    if (!VALID_NAME.test(name)) {
      return c.json({ error: "Invalid prompt name" }, 400)
    }
    const modelId = resolvePromptModelId(c.req.query("model"))
    if (!isValidPromptModelId(promptsDir, modelId)) {
      return c.json({ error: "Invalid model id" }, 400)
    }

    if (!basePromptExists(promptsDir, name)) {
      return c.json({ error: "Prompt not found" }, 404)
    }

    const resolvedName = promptNameForModel(name, modelId)
    const bookPromptsDir = path.join(booksDir, label, "prompts")
    const versionDir = path.join(bookPromptsDir, PROMPT_VERSIONS_DIR, resolvedName)
    if (fs.existsSync(versionDir)) {
      fs.rmSync(versionDir, { recursive: true, force: true })
    }

    const legacyFlatPath = path.join(bookPromptsDir, `${resolvedName}.liquid`)
    if (fs.existsSync(legacyFlatPath)) {
      fs.rmSync(legacyFlatPath, { force: true })
    }

    if (modelId) {
      const folderPath = path.join(bookPromptsDir, promptModelFolderName(modelId), `${name}.liquid`)
      if (fs.existsSync(folderPath)) {
        fs.rmSync(folderPath, { force: true })
      }
    }

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
    if (!isValidPromptModelId(promptsDir, modelId)) {
      return c.json({ error: "Invalid model id" }, 400)
    }

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
    writeCurrentPromptVersion(versionDir, version)
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
  const variantSourceMap = new Map<string, Map<string, Set<"file" | "version">>>()

  const addVariant = (baseName: string, variantName: string, source: "file" | "version") => {
    if (!variantMap.has(baseName)) variantMap.set(baseName, new Set())
    variantMap.get(baseName)!.add(variantName)
    if (!variantSourceMap.has(baseName)) variantSourceMap.set(baseName, new Map())
    const sources = variantSourceMap.get(baseName)!
    if (!sources.has(variantName)) sources.set(variantName, new Set())
    sources.get(variantName)!.add(source)
  }

  if (fs.existsSync(promptsDir)) {
    for (const file of fs.readdirSync(promptsDir, { withFileTypes: true })) {
      if (!file.isFile() || !file.name.endsWith(".liquid")) continue
      const name = file.name.replace(/\.liquid$/, "")
      const [baseName] = name.split("__")
      if (!baseName) continue
      if (name.includes("__")) {
        addVariant(baseName, name, "file")
      } else {
        names.add(name)
      }
    }

  }

  const versionsRoot = path.join(promptsDir, PROMPT_VERSIONS_DIR)
  if (fs.existsSync(versionsRoot)) {
    for (const name of fs.readdirSync(versionsRoot)) {
      const [baseName] = name.split("__")
      if (!baseName) continue
      if (name.includes("__")) {
        addVariant(baseName, name, "version")
      } else {
        names.add(name)
      }
    }
  }

  if (fs.existsSync(promptsDir)) {
    const rootPromptNames = new Set(names)
    for (const entry of fs.readdirSync(promptsDir, { withFileTypes: true })) {
      if (!entry.isDirectory() || !isPromptModelFolder(entry.name)) continue
      for (const file of fs.readdirSync(path.join(promptsDir, entry.name), { withFileTypes: true })) {
        if (!file.isFile() || !file.name.endsWith(".liquid")) continue
        const promptName = file.name.replace(/\.liquid$/, "")
        if (!VALID_NAME.test(promptName) || !rootPromptNames.has(promptName)) continue
        const variantName = `${promptName}__${entry.name}`
        addVariant(promptName, variantName, "file")
      }
    }
  }

  return [...names]
    .sort((a, b) => a.localeCompare(b))
    .map((name) => ({
      name,
      variants: [...(variantMap.get(name) ?? new Set<string>())].sort((a, b) => a.localeCompare(b)),
      variantSources: Object.fromEntries(
        [...(variantSourceMap.get(name) ?? new Map<string, Set<"file" | "version">>()).entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([variantName, sources]) => [
            variantName,
            sources.size > 1 ? "file+version" : [...sources][0],
          ]),
      ),
    }))
}

function normalizePromptModelId(value: string): string {
  return value.trim().toLowerCase()
}

function isValidPromptModelId(promptsDir: string, modelId: string | null): boolean {
  if (modelId == null) return true
  if (!VALID_MODEL_ID.test(modelId)) return false

  const folderName = promptModelFolderName(modelId)
  const builtInOwner = BUILT_IN_PROMPT_MODEL_OWNERS.get(folderName)
  if (builtInOwner && builtInOwner !== modelId) return false

  for (const existingModelId of readPromptModels(promptsDir)) {
    if (
      existingModelId !== modelId
      && promptModelFolderName(existingModelId) === folderName
    ) {
      return false
    }
  }

  return true
}

function readPromptModels(promptsDir: string): string[] {
  const filePath = path.join(promptsDir, PROMPT_MODELS_FILE)
  if (!fs.existsSync(filePath)) return []

  try {
    const data = JSON.parse(fs.readFileSync(filePath, "utf-8")) as { models?: unknown }
    if (!Array.isArray(data.models)) return []
    const models: string[] = []
    const modelFolders = new Map(BUILT_IN_PROMPT_MODEL_OWNERS)
    for (const value of data.models) {
      if (typeof value !== "string") continue
      const modelId = normalizePromptModelId(value)
      if (!modelId || !VALID_MODEL_ID.test(modelId) || models.includes(modelId)) continue
      const folderName = promptModelFolderName(modelId)
      const existingModel = modelFolders.get(folderName)
      if (existingModel && existingModel !== modelId) continue
      modelFolders.set(folderName, modelId)
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

function listPromptVersions(options: {
  root: string
  promptsDir: string
  booksDir?: string
  label?: string
  name: string
  modelId: string | null
}): {
  name: string
  resolvedName: string
  modelId: string | null
  fallbackContent: string | null
  fallbackResolvedName: string | null
  currentVersion: string | null
  versions: PromptVersionSummary[]
} {
  const { root, promptsDir, booksDir, label, name, modelId } = options
  const resolvedName = promptNameForModel(name, modelId)
  const fallback = readPromptVersionFallback({ root, promptsDir, booksDir, label, name, modelId })
  const versionDir = path.join(root, PROMPT_VERSIONS_DIR, resolvedName)
  const currentVersion = readCurrentPromptVersion(versionDir) ?? latestVersionFile(root, resolvedName)
  if (!fs.existsSync(versionDir)) {
    return {
      name,
      resolvedName,
      modelId,
      fallbackContent: fallback?.content ?? null,
      fallbackResolvedName: fallback?.resolvedName ?? null,
      currentVersion: null,
      versions: [],
    }
  }

  const versions = fs
    .readdirSync(versionDir)
    .filter((file) => file.endsWith(".liquid"))
    .sort()
    .reverse()
    .map((version) => ({
      version,
      createdAt: createdAtFromPromptVersion(version),
      content: fs.readFileSync(path.join(versionDir, version), "utf-8"),
      isCurrent: version === currentVersion,
    }))

  return {
    name,
    resolvedName,
    modelId,
    fallbackContent: fallback?.content ?? null,
    fallbackResolvedName: fallback?.resolvedName ?? null,
    currentVersion,
    versions,
  }
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

function readPromptVersionFallback(options: {
  root: string
  promptsDir: string
  booksDir?: string
  label?: string
  name: string
  modelId: string | null
}): { content: string; resolvedName: string } | null {
  const { root, promptsDir, booksDir, label, name, modelId } = options
  const resolvedName = promptNameForModel(name, modelId)

  if (modelId && resolvedName !== name) {
    const rootModelPrompt = readModelPromptFallbackFromRoot(root, name, resolvedName, modelId)
    if (rootModelPrompt) return { ...rootModelPrompt, resolvedName }
    const modelPrompt = root === promptsDir
      ? null
      : readModelPromptFallbackFromRoot(promptsDir, name, resolvedName, modelId)
    if (modelPrompt) return { ...modelPrompt, resolvedName }
  }

  const rootFlatPath = path.join(root, `${name}.liquid`)
  if (fs.existsSync(rootFlatPath)) {
    return { content: fs.readFileSync(rootFlatPath, "utf-8"), resolvedName: name }
  }

  if (booksDir && label) {
    const globalPrompt = readPrompt({ promptsDir, name, modelId })
    if (globalPrompt) {
      return { content: globalPrompt.content, resolvedName: globalPrompt.resolvedName }
    }
  }

  const flatPath = path.join(promptsDir, `${name}.liquid`)
  if (!fs.existsSync(flatPath)) return null
  return { content: fs.readFileSync(flatPath, "utf-8"), resolvedName: name }
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

function readModelPromptFallbackFromRoot(
  root: string,
  promptName: string,
  resolvedName: string,
  modelId: string,
): { content: string } | null {
  const folderPath = path.join(root, promptModelFolderName(modelId), `${promptName}.liquid`)
  if (fs.existsSync(folderPath)) {
    return { content: fs.readFileSync(folderPath, "utf-8") }
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
  const currentVersion = readCurrentPromptVersion(versionDir)
  if (currentVersion && versions.includes(currentVersion)) return currentVersion
  return versions.at(-1) ?? null
}

function readCurrentPromptVersion(versionDir: string): string | null {
  const currentPath = path.join(versionDir, PROMPT_CURRENT_VERSION_FILE)
  if (!fs.existsSync(currentPath)) return null

  const currentVersion = fs.readFileSync(currentPath, "utf-8").trim()
  if (!VALID_VERSION_FILE.test(currentVersion)) return null
  if (!fs.existsSync(path.join(versionDir, currentVersion))) return null
  return currentVersion
}

function writeCurrentPromptVersion(versionDir: string, version: string) {
  fs.writeFileSync(path.join(versionDir, PROMPT_CURRENT_VERSION_FILE), `${version}\n`, "utf-8")
}

function createPromptVersionName(versionDir: string): string {
  const timestamp = new Date().toISOString().replace(/[-:]/g, "").replace(".", "")
  for (let index = 0; index < 1000; index += 1) {
    const candidate = `${timestamp}-${String(index).padStart(3, "0")}.liquid`
    if (!fs.existsSync(path.join(versionDir, candidate))) return candidate
  }
  throw new Error("Unable to create unique prompt version name")
}

function createdAtFromPromptVersion(version: string): string | null {
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(\d{3})Z-\d{3}\.liquid$/.exec(version)
  if (!match) return null

  const [, year, month, day, hour, minute, second, millisecond] = match
  return `${year}-${month}-${day}T${hour}:${minute}:${second}.${millisecond}Z`
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
