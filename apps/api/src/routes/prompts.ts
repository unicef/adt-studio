import path from "node:path"
import fs from "node:fs"
import { createHash, randomUUID } from "node:crypto"
import { Hono } from "hono"
import { resolvePromptModelId } from "@adt/llm"
import { parseBookLabel } from "@adt/types"
import type { PromptResponse, PromptVersionSummary, PromptSource, PromptSaveTarget } from "@adt/types"

const VALID_NAME = /^[a-zA-Z0-9_]+$/
const VALID_MODEL_ID = /^[a-zA-Z][a-zA-Z0-9]*:[a-zA-Z0-9][a-zA-Z0-9_.-]{0,159}$/
const PROMPT_VERSIONS_DIR = ".versions"
const PROMPT_MODELS_FILE = ".models.json"
const PROMPT_CURRENT_VERSION_FILE = ".current"
const PROMPT_FALLBACK_VERSION = "fallback"
const PROMPT_DEFAULT_VERSION = "default"
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

export function createPromptRoutes(
  promptsDir: string,
  booksDir: string,
  promptOverridesDir: string = promptsDir,
) {
  const app = new Hono()
  const templatesDir = path.join(path.dirname(promptsDir), "templates")
  const globalRoots = uniqueRoots(promptOverridesDir, promptsDir)
  migrateLegacyPromptOverrides(promptsDir, promptOverridesDir)

  // GET /prompt-models - list additional globally configured prompt model IDs
  app.get("/prompt-models", (c) => {
    return c.json({ models: readPromptModels(globalRoots) })
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

    writePromptModels(promptOverridesDir, models)
    return c.json({ models })
  })

  // GET /prompts - list global prompt template names and model variants
  app.get("/prompts", (c) => {
    return c.json({ prompts: listPrompts(globalRoots) })
  })

  // GET /prompts/:name/versions - list versioned global prompt overrides
  app.get("/prompts/:name/versions", (c) => {
    const name = c.req.param("name")
    if (!VALID_NAME.test(name)) {
      return c.json({ error: "Invalid prompt name" }, 400)
    }
    const modelId = resolvePromptModelId(c.req.query("model"))
    if (!isValidPromptModelId(globalRoots, modelId)) {
      return c.json({ error: "Invalid model id" }, 400)
    }

    if (!basePromptExists(globalRoots, name)) {
      return c.json({ error: "Prompt not found" }, 404)
    }

    return c.json(listPromptVersions({
      root: promptOverridesDir,
      fallbackRoots: [promptsDir],
      name,
      modelId,
    }))
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
    if (!isValidPromptModelId(globalRoots, modelId)) {
      return c.json({ error: "Invalid model id" }, 400)
    }

    if (!basePromptExists(globalRoots, name)) {
      return c.json({ error: "Prompt not found" }, 404)
    }

    const resolvedName = promptNameForResolvedModel(name, modelId)
    const versionDir = path.join(promptOverridesDir, PROMPT_VERSIONS_DIR, resolvedName)
    const versionPath = path.join(versionDir, version)
    if (!fs.existsSync(versionPath)) {
      return c.json({ error: "Prompt version not found" }, 404)
    }

    writeCurrentPromptVersion(versionDir, version)
    const prompt = readPrompt({ globalRoots, promptOverridesDir, name, modelId })
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
    if (!isValidPromptModelId(globalRoots, modelId)) {
      return c.json({ error: "Invalid model id" }, 400)
    }

    const prompt = readPrompt({ globalRoots, promptOverridesDir, name, modelId })
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
    if (!isValidPromptModelId(globalRoots, modelId)) {
      return c.json({ error: "Invalid model id" }, 400)
    }

    const body = await c.req.json<{ content: string; revision?: unknown }>()
    if (typeof body.content !== "string") {
      return c.json({ error: "Missing content field" }, 400)
    }

    if (!basePromptExists(globalRoots, name)) {
      return c.json({ error: "Prompt not found" }, 404)
    }

    const currentPrompt = readPrompt({ globalRoots, promptOverridesDir, name, modelId })
    if (!currentPrompt) return c.json({ error: "Prompt not found" }, 404)
    if (body.content === currentPrompt.content) return c.json(currentPrompt)
    if (body.revision != null && body.revision !== currentPrompt.revision) {
      return c.json({
        error: "Prompt changed since it was loaded",
        code: "PROMPT_CONFLICT",
        current: currentPrompt,
      }, 409)
    }

    const resolvedName = promptNameForResolvedModel(name, modelId)
    writePromptVersion(promptOverridesDir, resolvedName, body.content)
    const saved = readPrompt({ globalRoots, promptOverridesDir, name, modelId })
    if (!saved) return c.json({ error: "Prompt not found" }, 404)
    return c.json(saved)
  })

  // DELETE /prompts/:name - reset global prompt to its shipped flat-file default
  app.delete("/prompts/:name", (c) => {
    const name = c.req.param("name")
    if (!VALID_NAME.test(name)) {
      return c.json({ error: "Invalid prompt name" }, 400)
    }
    const modelId = resolvePromptModelId(c.req.query("model"))
    if (!isValidPromptModelId(globalRoots, modelId)) {
      return c.json({ error: "Invalid model id" }, 400)
    }

    if (!basePromptExists(globalRoots, name)) {
      return c.json({ error: "Prompt not found" }, 404)
    }

    const resolvedName = promptNameForResolvedModel(name, modelId)
    const versionDir = path.join(promptOverridesDir, PROMPT_VERSIONS_DIR, resolvedName)
    fs.mkdirSync(versionDir, { recursive: true })
    writeCurrentPromptVersion(versionDir, PROMPT_DEFAULT_VERSION)

    const prompt = readPrompt({ globalRoots, promptOverridesDir, name, modelId })
    if (!prompt) {
      return c.json({ error: "Prompt not found" }, 404)
    }

    return c.json(prompt)
  })

  // GET /books/:label/prompts/:name/versions - list versioned book prompt overrides
  app.get("/books/:label/prompts/:name/versions", (c) => {
    const label = validBookLabel(c.req.param("label"))
    if (!label) return c.json({ error: "Invalid book label" }, 400)
    const name = c.req.param("name")
    if (!VALID_NAME.test(name)) {
      return c.json({ error: "Invalid prompt name" }, 400)
    }
    const modelId = resolvePromptModelId(c.req.query("model"))
    if (!isValidPromptModelId(globalRoots, modelId)) {
      return c.json({ error: "Invalid model id" }, 400)
    }

    if (!basePromptExists(globalRoots, name)) {
      return c.json({ error: "Prompt not found" }, 404)
    }

    const bookPromptsDir = path.join(booksDir, label, "prompts")
    return c.json(listPromptVersions({
      root: bookPromptsDir,
      fallbackRoots: globalRoots,
      name,
      modelId,
    }))
  })

  // PUT /books/:label/prompts/:name/versions/:version/current - select active book prompt version
  app.put("/books/:label/prompts/:name/versions/:version/current", (c) => {
    const label = validBookLabel(c.req.param("label"))
    if (!label) return c.json({ error: "Invalid book label" }, 400)
    const name = c.req.param("name")
    const version = c.req.param("version")
    if (!VALID_NAME.test(name)) {
      return c.json({ error: "Invalid prompt name" }, 400)
    }
    if (!VALID_VERSION_FILE.test(version)) {
      return c.json({ error: "Invalid prompt version" }, 400)
    }
    const modelId = resolvePromptModelId(c.req.query("model"))
    if (!isValidPromptModelId(globalRoots, modelId)) {
      return c.json({ error: "Invalid model id" }, 400)
    }

    if (!basePromptExists(globalRoots, name)) {
      return c.json({ error: "Prompt not found" }, 404)
    }

    const resolvedName = promptNameForResolvedModel(name, modelId)
    const versionDir = path.join(booksDir, label, "prompts", PROMPT_VERSIONS_DIR, resolvedName)
    const versionPath = path.join(versionDir, version)
    if (!fs.existsSync(versionPath)) {
      return c.json({ error: "Prompt version not found" }, 404)
    }

    writeCurrentPromptVersion(versionDir, version)
    const prompt = readPrompt({ globalRoots, promptOverridesDir, booksDir, label, name, modelId })
    if (!prompt) {
      return c.json({ error: "Prompt not found" }, 404)
    }

    return c.json(prompt)
  })

  // GET /books/:label/prompts/:name - read book override, fall back to global
  app.get("/books/:label/prompts/:name", (c) => {
    const label = validBookLabel(c.req.param("label"))
    if (!label) return c.json({ error: "Invalid book label" }, 400)
    const name = c.req.param("name")
    if (!VALID_NAME.test(name)) {
      return c.json({ error: "Invalid prompt name" }, 400)
    }
    const modelId = resolvePromptModelId(c.req.query("model"))
    if (!isValidPromptModelId(globalRoots, modelId)) {
      return c.json({ error: "Invalid model id" }, 400)
    }

    const prompt = readPrompt({ globalRoots, promptOverridesDir, booksDir, label, name, modelId })
    if (!prompt) {
      return c.json({ error: "Prompt not found" }, 404)
    }

    return c.json(prompt)
  })

  // DELETE /books/:label/prompts/:name - reset book prompt override to global fallback
  app.delete("/books/:label/prompts/:name", (c) => {
    const label = validBookLabel(c.req.param("label"))
    if (!label) return c.json({ error: "Invalid book label" }, 400)
    const name = c.req.param("name")
    if (!VALID_NAME.test(name)) {
      return c.json({ error: "Invalid prompt name" }, 400)
    }
    const modelId = resolvePromptModelId(c.req.query("model"))
    if (!isValidPromptModelId(globalRoots, modelId)) {
      return c.json({ error: "Invalid model id" }, 400)
    }

    if (!basePromptExists(globalRoots, name)) {
      return c.json({ error: "Prompt not found" }, 404)
    }

    const resolvedName = promptNameForResolvedModel(name, modelId)
    const bookPromptsDir = path.join(booksDir, label, "prompts")
    const versionDir = path.join(bookPromptsDir, PROMPT_VERSIONS_DIR, resolvedName)
    fs.mkdirSync(versionDir, { recursive: true })
    writeCurrentPromptVersion(versionDir, PROMPT_FALLBACK_VERSION)

    const prompt = readPrompt({ globalRoots, promptOverridesDir, booksDir, label, name, modelId })
    if (!prompt) {
      return c.json({ error: "Prompt not found" }, 404)
    }

    return c.json(prompt)
  })

  // PUT /books/:label/prompts/:name - save book-level override
  app.put("/books/:label/prompts/:name", async (c) => {
    const label = validBookLabel(c.req.param("label"))
    if (!label) return c.json({ error: "Invalid book label" }, 400)
    const name = c.req.param("name")
    if (!VALID_NAME.test(name)) {
      return c.json({ error: "Invalid prompt name" }, 400)
    }
    const modelId = resolvePromptModelId(c.req.query("model"))
    if (!isValidPromptModelId(globalRoots, modelId)) {
      return c.json({ error: "Invalid model id" }, 400)
    }

    const body = await c.req.json<{ content: string; revision?: unknown }>()
    if (typeof body.content !== "string") {
      return c.json({ error: "Missing content field" }, 400)
    }

    if (!basePromptExists(globalRoots, name)) {
      return c.json({ error: "Prompt not found" }, 404)
    }

    const currentPrompt = readPrompt({ globalRoots, promptOverridesDir, booksDir, label, name, modelId })
    if (!currentPrompt) return c.json({ error: "Prompt not found" }, 404)
    if (body.content === currentPrompt.content) return c.json(currentPrompt)
    if (body.revision != null && body.revision !== currentPrompt.revision) {
      return c.json({
        error: "Prompt changed since it was loaded",
        code: "PROMPT_CONFLICT",
        current: currentPrompt,
      }, 409)
    }

    // Write an immutable book-level prompt version. Existing flat overrides are
    // still read for compatibility, but new saves are versioned.
    const bookPromptsDir = path.join(booksDir, label, "prompts")
    const resolvedName = promptNameForResolvedModel(name, modelId)
    writePromptVersion(bookPromptsDir, resolvedName, body.content)
    const saved = readPrompt({ globalRoots, promptOverridesDir, booksDir, label, name, modelId })
    if (!saved) return c.json({ error: "Prompt not found" }, 404)
    return c.json(saved)
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

function listPrompts(roots: string[]): PromptSummary[] {
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

  for (const root of roots) {
    if (!fs.existsSync(root)) continue
    for (const file of fs.readdirSync(root, { withFileTypes: true })) {
      if (!file.isFile() || !file.name.endsWith(".liquid")) continue
      const name = file.name.replace(/\.liquid$/, "")
      const [baseName] = name.split("__")
      if (!baseName) continue
      if (name.includes("__")) addVariant(baseName, name, "file")
      else names.add(name)
    }

    const versionsRoot = path.join(root, PROMPT_VERSIONS_DIR)
    if (fs.existsSync(versionsRoot)) {
      for (const name of fs.readdirSync(versionsRoot)) {
        if (promptVersionSelection(root, name).kind !== "version") continue
        const [baseName] = name.split("__")
        if (!baseName) continue
        if (name.includes("__")) addVariant(baseName, name, "version")
        else names.add(name)
      }
    }

    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory() || !isPromptModelFolder(entry.name)) continue
      for (const file of fs.readdirSync(path.join(root, entry.name), { withFileTypes: true })) {
        if (!file.isFile() || !file.name.endsWith(".liquid")) continue
        const promptName = file.name.replace(/\.liquid$/, "")
        if (!VALID_NAME.test(promptName)) continue
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

function isValidPromptModelId(roots: string[], modelId: string | null): boolean {
  if (modelId == null) return true
  if (!VALID_MODEL_ID.test(modelId)) return false

  const folderName = promptModelFolderName(modelId)
  const builtInOwner = BUILT_IN_PROMPT_MODEL_OWNERS.get(folderName)
  if (builtInOwner && builtInOwner !== modelId) return false

  for (const existingModelId of readPromptModels(roots)) {
    if (
      existingModelId !== modelId
      && promptModelFolderName(existingModelId) === folderName
    ) {
      return false
    }
  }

  return true
}

function readPromptModels(roots: string[]): string[] {
  for (const root of roots) {
    const filePath = path.join(root, PROMPT_MODELS_FILE)
    if (!fs.existsSync(filePath)) continue
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
  return []
}

function writePromptModels(promptsDir: string, models: string[]) {
  fs.mkdirSync(promptsDir, { recursive: true })
  writeFileAtomic(
    path.join(promptsDir, PROMPT_MODELS_FILE),
    `${JSON.stringify({ models }, null, 2)}\n`,
  )
}

function listPromptVersions(options: {
  root: string
  fallbackRoots: string[]
  name: string
  modelId: string | null
}): {
  name: string
  resolvedName: string
  modelId: string | null
  fallbackContent: string | null
  fallbackResolvedName: string | null
  currentVersion: string | null
  isFallbackCurrent: boolean
  versions: PromptVersionSummary[]
} {
  const { root, fallbackRoots, name, modelId } = options
  const resolvedName = promptNameForResolvedModel(name, modelId)
  const fallback = resolvePromptFromRoots(fallbackRoots, name, modelId)
  const versionDir = path.join(root, PROMPT_VERSIONS_DIR, resolvedName)
  const selection = promptVersionSelection(root, resolvedName)
  const currentVersion = selection.kind === "version" ? selection.version : null
  const isFallbackCurrent = selection.kind === "fallback" || selection.kind === "default"
  if (!fs.existsSync(versionDir)) {
    return {
      name,
      resolvedName,
      modelId,
      fallbackContent: fallback?.content ?? null,
      fallbackResolvedName: fallback?.resolvedName ?? null,
      currentVersion: null,
      isFallbackCurrent: false,
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
    isFallbackCurrent,
    versions,
  }
}

function basePromptExists(roots: string[], name: string): boolean {
  return resolvePromptFromRoots(roots, name, null) != null
}

function readPrompt(options: {
  globalRoots: string[]
  promptOverridesDir: string
  booksDir?: string
  label?: string
  name: string
  modelId: string | null
}): PromptResponse | null {
  const { globalRoots, promptOverridesDir, booksDir, label, name, modelId } = options
  const bookRoot = booksDir && label ? path.join(booksDir, label, "prompts") : null
  const roots = bookRoot ? uniqueRoots(bookRoot, ...globalRoots) : globalRoots
  const resolved = resolvePromptFromRoots(roots, name, modelId)
  if (!resolved) return null

  const source: PromptSource = bookRoot && resolved.root === bookRoot
    ? "book"
    : resolved.root === promptOverridesDir
      ? "global"
      : "bundled"
  const saveTarget: PromptSaveTarget = bookRoot ? "book" : "global"
  const logicalPath = saveTarget === "book"
    ? `prompts/${PROMPT_VERSIONS_DIR}/${resolved.resolvedName}`
    : `${PROMPT_VERSIONS_DIR}/${resolved.resolvedName}`
  const revision = createHash("sha256")
    .update(JSON.stringify({
      name,
      resolvedName: resolved.resolvedName,
      content: resolved.content,
      source,
      version: resolved.version ?? null,
    }))
    .digest("hex")

  return {
    name,
    resolvedName: resolved.resolvedName,
    content: resolved.content,
    source,
    modelId: resolved.resolvedName === name ? null : modelId,
    ...(resolved.version ? { version: resolved.version } : {}),
    revision,
    persistence: { source, saveTarget, logicalPath },
  }
}

interface ResolvedPromptFile {
  root: string
  resolvedName: string
  content: string
  version?: string
}

function resolvePromptFromRoots(
  roots: string[],
  name: string,
  modelId: string | null,
): ResolvedPromptFile | null {
  const resolvedName = promptNameForResolvedModel(name, modelId)
  if (modelId && resolvedName !== name) {
    let ignoreVersions = false
    for (const root of roots) {
      const variant = readPromptFromRoot(root, name, resolvedName, modelId, ignoreVersions)
      if (variant === "default") {
        ignoreVersions = true
        continue
      }
      if (variant === "fallback") continue
      if (variant) return { root, resolvedName, ...variant }
    }
  }

  let ignoreVersions = false
  for (const root of roots) {
    const base = readPromptFromRoot(root, name, name, null, ignoreVersions)
    if (base === "default") {
      ignoreVersions = true
      continue
    }
    if (base === "fallback") continue
    if (base) return { root, resolvedName: name, ...base }
  }
  return null
}

function readPromptFromRoot(
  root: string,
  promptName: string,
  resolvedName: string,
  modelId: string | null,
  ignoreVersions = false,
): { content: string; version?: string } | "fallback" | "default" | null {
  const selection = ignoreVersions
    ? { kind: "none" } as const
    : promptVersionSelection(root, resolvedName)
  if (selection.kind === "fallback") return "fallback"
  if (selection.kind === "default") return "default"
  if (selection.kind === "version") {
    return {
      content: fs.readFileSync(selection.filePath, "utf-8"),
      version: selection.version,
    }
  }

  if (modelId) {
    const folderPath = path.join(root, promptModelFolderName(modelId), `${promptName}.liquid`)
    if (fs.existsSync(folderPath)) return { content: fs.readFileSync(folderPath, "utf-8") }
  }

  const flatPath = path.join(root, `${resolvedName}.liquid`)
  return fs.existsSync(flatPath)
    ? { content: fs.readFileSync(flatPath, "utf-8") }
    : null
}

type PromptVersionSelection =
  | { kind: "none" }
  | { kind: "fallback" }
  | { kind: "default" }
  | { kind: "version"; version: string; filePath: string }

function promptVersionSelection(root: string, promptName: string): PromptVersionSelection {
  const versionDir = path.join(root, PROMPT_VERSIONS_DIR, promptName)
  if (!fs.existsSync(versionDir)) return { kind: "none" }

  const current = readCurrentPromptVersion(versionDir)
  if (current === PROMPT_FALLBACK_VERSION) return { kind: "fallback" }
  if (current === PROMPT_DEFAULT_VERSION) return { kind: "default" }

  const versions = fs
    .readdirSync(versionDir)
    .filter((file) => file.endsWith(".liquid"))
    .sort()
  const version = current && versions.includes(current) ? current : versions.at(-1)
  return version
    ? { kind: "version", version, filePath: path.join(versionDir, version) }
    : { kind: "none" }
}

function readCurrentPromptVersion(versionDir: string): string | null {
  const currentPath = path.join(versionDir, PROMPT_CURRENT_VERSION_FILE)
  if (!fs.existsSync(currentPath)) return null

  const currentVersion = fs.readFileSync(currentPath, "utf-8").trim()
  if (currentVersion === PROMPT_FALLBACK_VERSION) return currentVersion
  if (currentVersion === PROMPT_DEFAULT_VERSION) return currentVersion
  if (!VALID_VERSION_FILE.test(currentVersion)) return null
  if (!fs.existsSync(path.join(versionDir, currentVersion))) return null
  return currentVersion
}

function writeCurrentPromptVersion(versionDir: string, version: string) {
  writeFileAtomic(path.join(versionDir, PROMPT_CURRENT_VERSION_FILE), `${version}\n`)
}

function writePromptVersion(root: string, resolvedName: string, content: string): string {
  const versionDir = path.join(root, PROMPT_VERSIONS_DIR, resolvedName)
  fs.mkdirSync(versionDir, { recursive: true })
  const version = createPromptVersionName(versionDir)
  fs.writeFileSync(path.join(versionDir, version), content, { encoding: "utf-8", flag: "wx" })
  writeCurrentPromptVersion(versionDir, version)
  return version
}

function writeFileAtomic(filePath: string, content: string) {
  const tempPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`
  fs.writeFileSync(tempPath, content, { encoding: "utf-8", flag: "wx" })
  fs.renameSync(tempPath, filePath)
}

function uniqueRoots(...roots: string[]): string[] {
  const seen = new Set<string>()
  return roots.filter((root) => {
    const key = path.resolve(root)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function validBookLabel(label: string): string | null {
  try {
    return parseBookLabel(label)
  } catch {
    return null
  }
}

function migrateLegacyPromptOverrides(promptsDir: string, promptOverridesDir: string) {
  if (path.resolve(promptsDir) === path.resolve(promptOverridesDir)) return

  const legacyVersionsRoot = path.join(promptsDir, PROMPT_VERSIONS_DIR)
  if (fs.existsSync(legacyVersionsRoot)) {
    for (const entry of fs.readdirSync(legacyVersionsRoot, { withFileTypes: true })) {
      if (!entry.isDirectory() || !VALID_NAME.test(entry.name)) continue
      const legacyVersionDir = path.join(legacyVersionsRoot, entry.name)
      const targetVersionDir = path.join(promptOverridesDir, PROMPT_VERSIONS_DIR, entry.name)
      fs.mkdirSync(targetVersionDir, { recursive: true })

      for (const file of fs.readdirSync(legacyVersionDir)) {
        if (!VALID_VERSION_FILE.test(file)) continue
        const targetPath = path.join(targetVersionDir, file)
        if (!fs.existsSync(targetPath)) {
          fs.copyFileSync(path.join(legacyVersionDir, file), targetPath, fs.constants.COPYFILE_EXCL)
        }
      }

      const legacyCurrentPath = path.join(legacyVersionDir, PROMPT_CURRENT_VERSION_FILE)
      const targetCurrentPath = path.join(targetVersionDir, PROMPT_CURRENT_VERSION_FILE)
      if (fs.existsSync(legacyCurrentPath) && !fs.existsSync(targetCurrentPath)) {
        const current = fs.readFileSync(legacyCurrentPath, "utf-8").trim()
        if (
          current === PROMPT_FALLBACK_VERSION
          || current === PROMPT_DEFAULT_VERSION
          || VALID_VERSION_FILE.test(current)
        ) {
          writeCurrentPromptVersion(targetVersionDir, current)
        }
      }
    }
  }

  const legacyModelsPath = path.join(promptsDir, PROMPT_MODELS_FILE)
  const targetModelsPath = path.join(promptOverridesDir, PROMPT_MODELS_FILE)
  if (fs.existsSync(legacyModelsPath) && !fs.existsSync(targetModelsPath)) {
    fs.mkdirSync(promptOverridesDir, { recursive: true })
    fs.copyFileSync(legacyModelsPath, targetModelsPath, fs.constants.COPYFILE_EXCL)
  }
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

function promptNameForResolvedModel(
  promptName: string,
  modelId: string | null,
): string {
  return modelId
    ? `${promptName}__${promptModelFolderName(modelId)}`
    : promptName
}

function promptModelFolderName(modelId: string): string {
  return modelId
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
}
