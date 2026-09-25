import { loadBookConfig } from "@adt/pipeline"
import path from "node:path"
import fs from "node:fs"
import type { Context } from "hono"
import { ZodError } from "zod"
import { Hono } from "hono"
import {
  resolvePromptModelId, promptModelFolderName, PromptFileError, promptPath,
  migratePromptOverrides, withPromptGates, writePromptFileAtomic,
  listPromptVersionFiles, readPromptSelection,
} from "@adt/llm"
import { readPromptState, promptHistory, mutatePromptSelection } from "../services/prompt-store.js"
import { resolvePromptOverridesDir } from "../services/prompt-roots.js"
import yaml from "js-yaml"
import { AppConfig, DEFAULT_BASE_PROMPT_MODEL_ID, safeParseModelId, BookLabel, PromptName, PromptVersion, PromptMutation, PromptSave, PromptModels } from "@adt/types"

const VALID_NAME = /^[a-zA-Z0-9_]+$/
function isWellFormedPromptModelId(modelId: string): boolean {
  const parsed = safeParseModelId(modelId)
  return parsed.ok && !parsed.value.usedLegacyDefault
}
const PROMPT_VERSIONS_DIR = ".versions"
const PROMPT_MODELS_FILE = ".models.json"
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
  promptsDir: string, booksDir: string, configPath?: string,
  promptOverridesDir = resolvePromptOverridesDir(booksDir),
) {
  const app = new Hono()
  const templatesDir = path.join(path.dirname(promptsDir), "templates")
  const globalRoots = [promptOverridesDir, promptsDir]
  const basePromptModelId = (): string => {
    if (!configPath || !fs.existsSync(configPath)) return DEFAULT_BASE_PROMPT_MODEL_ID
    return AppConfig.parse(yaml.load(fs.readFileSync(configPath, "utf8"))).base_prompt_model ?? DEFAULT_BASE_PROMPT_MODEL_ID
  }
  app.onError((error, c) => {
    if (error instanceof ZodError) return c.json({ code: "PROMPT_INVALID_INPUT", error: "Invalid prompt input" }, 400)
    if (error instanceof PromptFileError) {
      const status = error.code === "PROMPT_BUSY" ? 503 : error.code === "PROMPT_NOT_FOUND" ? 404 : error.code.includes("CONFLICT") ? 409 : 400
      return c.json({ code: error.code, error: error.message }, status)
    }
    return c.json({ code: "PROMPT_STORAGE_ERROR", error: "Unable to persist or read the prompt. Check storage permissions and retry after reloading." }, 500)
  })

  app.get("/prompt-models", async (c) => {
    await migratePromptOverrides(promptsDir, promptOverridesDir)
    return c.json({ models: readPromptModels(globalRoots) })
  })
  app.put("/prompt-models", async (c) => {
    const body = PromptModels.parse(await c.req.json())
    await migratePromptOverrides(promptsDir, promptOverridesDir)
    return withPromptGates([promptOverridesDir], () => {
      const owners = new Map(BUILT_IN_PROMPT_MODEL_OWNERS)
      const models: string[] = []
      for (const value of body.models) {
        const model = normalizePromptModelId(value)
        if (!model) continue
        const folder = promptModelFolderName(model)
        if (!isValidPromptModelId(globalRoots, model) || (owners.has(folder) && owners.get(folder) !== model)) {
          return c.json({ code: "PROMPT_INVALID_MODEL", error: "Invalid or colliding prompt model id" }, 400)
        }
        owners.set(folder, model)
        if (!models.includes(model)) models.push(model)
      }
      writePromptModels(promptOverridesDir, models)
      return c.json({ models })
    })
  })
  app.get("/prompts", async (c) => {
    await migratePromptOverrides(promptsDir, promptOverridesDir)
    return c.json({ prompts: listPrompts(globalRoots) })
  })

  for (const book of [false, true]) {
    const prefix = book ? "/books/:label/prompts/:name" : "/prompts/:name"
    const requestContext = async (c: Context) => {
      const name = PromptName.parse(c.req.param("name"))
      if (name.includes("__")) throw new PromptFileError("PROMPT_INVALID_INPUT", "Select a model separately from the base prompt name")
      const label = book ? BookLabel.parse(c.req.param("label")) : undefined
      const bookRoot = label ? promptPath(booksDir, label, "prompts") : undefined
      const baseModel = label && configPath ? loadBookConfig(label, booksDir, configPath).base_prompt_model : basePromptModelId()
      const modelId = resolvePromptModelId(c.req.query("model"), baseModel)
      await migratePromptOverrides(promptsDir, promptOverridesDir, bookRoot)
      if (!isValidPromptModelId(globalRoots, modelId)) throw new PromptFileError("PROMPT_INVALID_MODEL", "Invalid or colliding prompt model id")
      const roots = bookRoot ? [bookRoot, ...globalRoots] : globalRoots
      return { name, modelId, roots }
    }
    app.get(prefix, async (c) => {
      const { name, modelId, roots } = await requestContext(c)
      const prompt = readPromptState(roots, name, modelId, book)
      return prompt ? c.json(prompt) : c.json({ error: "Prompt not found", code: "PROMPT_NOT_FOUND" }, 404)
    })
    app.get(`${prefix}/versions`, async (c) => {
      const { name, modelId, roots } = await requestContext(c)
      if (!readPromptState(roots, name, modelId, book)) return c.json({ error: "Prompt not found" }, 404)
      return c.json(promptHistory(roots, name, modelId))
    })
    const mutate = async (c: Context) => {
      const { name, modelId, roots } = await requestContext(c)
      if (!readPromptState(roots, name, modelId, book)) return c.json({ error: "Prompt not found", code: "PROMPT_NOT_FOUND" }, 404)
      const body: unknown = await c.req.json().catch(() => ({}))
      if (typeof body !== "object" || body === null || !("revision" in body) || !body.revision) {
        return c.json({ code: "PROMPT_PRECONDITION_REQUIRED", error: "Load the prompt revision before saving, resetting or restoring" }, 428)
      }
      const restore = c.req.param("version")
      const parsed = !restore && c.req.method === "PUT" ? PromptSave.parse(body) : PromptMutation.parse(body)
      if (restore) PromptVersion.parse(restore)
      return withPromptGates(roots.slice(0, -1), () => {
        const current = readPromptState(roots, name, modelId, book)
        if (!current) return c.json({ code: "PROMPT_NOT_FOUND", error: "Prompt not found" }, 404)
        if (current.revision !== parsed.revision) return c.json({ code: "PROMPT_CONFLICT", error: "Prompt changed since it was loaded", current }, 409)
        const operation = restore ? { kind: "restore" as const, version: restore }
          : "content" in parsed ? { kind: "save" as const, content: PromptSave.parse(body).content }
          : { kind: "reset" as const }
        return c.json(mutatePromptSelection(roots, name, modelId, book, operation))
      })
    }
    app.on(["PUT", "DELETE"], prefix, mutate)
    app.put(`${prefix}/versions/:version/current`, mutate)
  }

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
    const label = BookLabel.parse(c.req.param("label"))
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
    const label = BookLabel.parse(c.req.param("label"))
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
        if (listPromptVersionFiles(root, name).length === 0) continue
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
  if (!isWellFormedPromptModelId(modelId)) return false

  const folderName = promptModelFolderName(modelId)
  for (const root of roots) {
    const versions = promptPath(root, ".versions")
    if (!fs.existsSync(versions)) continue
    for (const candidate of fs.readdirSync(versions)) {
      if (!candidate.endsWith(`__${folderName}`)) continue
      const owner = readPromptSelection(root, candidate)?.modelId
      if (owner && owner !== modelId) return false
    }
  }
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
    const filePath = promptPath(root, PROMPT_MODELS_FILE)
    if (!fs.existsSync(filePath)) continue
    try {
      const data = JSON.parse(fs.readFileSync(filePath, "utf-8")) as { models?: unknown }
      if (!Array.isArray(data.models)) return []
      const models: string[] = []
      const modelFolders = new Map(BUILT_IN_PROMPT_MODEL_OWNERS)
      for (const value of data.models) {
        if (typeof value !== "string") continue
        const modelId = normalizePromptModelId(value)
        if (!modelId || !isWellFormedPromptModelId(modelId) || models.includes(modelId)) continue
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
  writePromptFileAtomic(
    promptPath(promptsDir, PROMPT_MODELS_FILE),
    `${JSON.stringify({ models }, null, 2)}\n`,
  )
}

function isPromptModelFolder(name: string): boolean {
  return name !== PROMPT_VERSIONS_DIR && name !== "node_modules" && VALID_NAME.test(name)
}
