import {
  Liquid,
  Tag,
  type TagToken,
  type TopLevelToken,
  type Template,
  type Context,
  type Emitter,
} from "liquidjs"
import fs from "node:fs"
import path from "node:path"
import type { Message, ContentPart } from "./types.js"

const IMAGE_MARKER_START = "\x00IMG:"
const IMAGE_MARKER_END = "\x00"
const PROMPT_VERSIONS_DIR = ".versions"
const PROMPT_CURRENT_VERSION_FILE = ".current"
const BASE_PROMPT_MODEL_ID = "openai:gpt-5.4"

export interface PromptRenderOptions {
  modelId?: string
}

export interface PromptResolution {
  requestedName: string
  resolvedName: string
  modelId: string | null
  filePath: string
}

export interface PromptEngine {
  renderPrompt(
    templateName: string,
    context: Record<string, unknown>,
    options?: PromptRenderOptions,
  ): Promise<Message[]>
  resolvePrompt(templateName: string, options?: PromptRenderOptions): PromptResolution
}

/**
 * Create a prompt engine that renders Liquid templates from a directory.
 * Supports custom {% chat %} and {% image %} tags.
 */
export function createPromptEngine(promptsDir: string | string[]): PromptEngine {
  const roots = Array.isArray(promptsDir) ? promptsDir : [promptsDir]

  return {
    resolvePrompt(templateName: string, options?: PromptRenderOptions): PromptResolution {
      return resolvePromptTemplate(roots, templateName, options)
    },

    async renderPrompt(
      templateName: string,
      context: Record<string, unknown>,
      options?: PromptRenderOptions,
    ): Promise<Message[]> {
      const resolved = resolvePromptTemplate(roots, templateName, options)
      const template = fs.readFileSync(resolved.filePath, "utf-8")
      const engine = createLiquidEngine(renderRootsForResolution(roots, resolved))
      const raw = await engine.parseAndRender(template, context)
      return parseMessages(raw)
    },
  }
}

function createLiquidEngine(roots: string[]): Liquid {
  const engine = new Liquid({
    root: roots,
    extname: ".liquid",
    strictVariables: false,
  })

  engine.registerTag("chat", createChatTag(engine))
  engine.registerTag("image", ImageTag)
  return engine
}

function renderRootsForResolution(roots: string[], resolved: PromptResolution): string[] {
  const renderRoots: string[] = []
  const seen = new Set<string>()
  const addRoot = (root: string) => {
    const key = path.resolve(root).toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    renderRoots.push(root)
  }

  addRoot(path.dirname(resolved.filePath))

  if (resolved.modelId && resolved.resolvedName !== resolved.requestedName) {
    const modelFolder = promptModelFolderName(resolved.modelId)
    for (const root of roots) {
      addRoot(path.join(root, modelFolder))
    }
  }

  for (const root of roots) {
    addRoot(root)
  }

  return renderRoots
}

export function resolvePromptModelId(modelId: string | undefined): string | null {
  if (!modelId) return null
  const normalized = modelId.trim().toLowerCase()
  if (!normalized) return null
  const canonical = normalized.includes(":") ? normalized : `openai:${normalized}`
  if (canonical === BASE_PROMPT_MODEL_ID) return null
  return canonical
}

export function promptNameForModel(
  templateName: string,
  modelId: string | null | undefined,
): string {
  const resolvedModelId = resolvePromptModelId(modelId ?? undefined)
  if (!resolvedModelId) return templateName
  return `${templateName}__${promptModelFolderName(resolvedModelId)}`
}

export function promptModelFolderName(modelId: string): string {
  return sanitizePromptModelId(modelId)
}

function resolvePromptTemplate(
  roots: string[],
  templateName: string,
  options?: PromptRenderOptions,
): PromptResolution {
  const modelId = resolvePromptModelId(options?.modelId)

  if (modelId) {
    const variantName = promptNameForModel(templateName, modelId)
    const variant = findModelPromptTemplate(roots, templateName, modelId, variantName)
    if (variant) {
      return { requestedName: templateName, resolvedName: variantName, modelId, filePath: variant }
    }
  }

  const base = findPromptTemplate(roots, templateName)
  if (base) {
    return { requestedName: templateName, resolvedName: templateName, modelId, filePath: base }
  }

  throw new Error(`Prompt template not found: ${templateName}`)
}

function sanitizePromptModelId(modelId: string): string {
  return modelId
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
}

function findPromptTemplate(roots: string[], name: string): string | null {
  for (const root of roots) {
    const versionedPath = latestVersionedPromptPath(root, name)
    if (versionedPath) {
      return versionedPath
    }

    const flatPath = path.join(root, `${name}.liquid`)
    if (fs.existsSync(flatPath)) {
      return flatPath
    }
  }

  return null
}

function findModelPromptTemplate(
  roots: string[],
  templateName: string,
  modelId: string,
  variantName: string,
): string | null {
  const modelFolder = promptModelFolderName(modelId)
  for (const root of roots) {
    const versionedPath = latestVersionedPromptPath(root, variantName)
    if (versionedPath) {
      return versionedPath
    }

    const folderPath = path.join(root, modelFolder, `${templateName}.liquid`)
    if (fs.existsSync(folderPath)) {
      return folderPath
    }

    const legacyFlatPath = path.join(root, `${variantName}.liquid`)
    if (fs.existsSync(legacyFlatPath)) {
      return legacyFlatPath
    }
  }

  return null
}

function latestVersionedPromptPath(root: string, promptName: string): string | null {
  const versionDir = path.join(root, PROMPT_VERSIONS_DIR, promptName)
  if (!fs.existsSync(versionDir)) return null

  const currentPath = currentVersionedPromptPath(versionDir)
  if (currentPath) return currentPath

  const files = fs
    .readdirSync(versionDir)
    .filter((file) => file.endsWith(".liquid"))
    .sort()
  const latest = files.at(-1)
  return latest ? path.join(versionDir, latest) : null
}

function currentVersionedPromptPath(versionDir: string): string | null {
  const currentPath = path.join(versionDir, PROMPT_CURRENT_VERSION_FILE)
  if (!fs.existsSync(currentPath)) return null

  const currentVersion = fs.readFileSync(currentPath, "utf-8").trim()
  if (
    !currentVersion.endsWith(".liquid")
    || currentVersion.includes("/")
    || currentVersion.includes("\\")
    || currentVersion.includes("..")
  ) {
    return null
  }

  const promptPath = path.join(versionDir, currentVersion)
  return fs.existsSync(promptPath) ? promptPath : null
}

/**
 * {% chat role: "system"|"user"|"assistant" %} ... {% endchat %}
 * Emits delimiters that are parsed into PromptMessage[].
 */
function createChatTag(liquid: Liquid) {
  return class ChatTag extends Tag {
    private role: string
    private templates: Template[]

    constructor(token: TagToken, remainTokens: TopLevelToken[], _liquid: Liquid) {
      super(token, remainTokens, _liquid)
      const match = token.args.match(/role:\s*"(\w+)"/)
      if (!match) {
        throw new Error(`{% chat %} requires role: "system"|"user"|"assistant"`)
      }
      this.role = match[1]
      this.templates = []
      const stream = liquid.parser
        .parseStream(remainTokens)
        .on("tag:endchat", () => stream.stop())
        .on("template", (tpl: Template) => this.templates.push(tpl))
        .on("end", () => {
          throw new Error("{% chat %} missing {% endchat %}")
        })
      stream.start()
    }

    *render(ctx: Context, emitter: Emitter): Generator<unknown, void, unknown> {
      emitter.write(`\x01CHAT:${this.role}\x01`)
      yield liquid.renderer.renderTemplates(this.templates, ctx, emitter)
      emitter.write(`\x01ENDCHAT\x01`)
    }
  }
}

/**
 * {% image expr %}
 * Evaluates the expression and emits a marker that parseMessages
 * converts into an image content part.
 */
class ImageTag extends Tag {
  private value: string

  constructor(token: TagToken, remainTokens: TopLevelToken[], liquid: Liquid) {
    super(token, remainTokens, liquid)
    this.value = token.args.trim()
  }

  *render(ctx: Context, emitter: Emitter): Generator<unknown, void, unknown> {
    const val = yield this.liquid.evalValue(this.value, ctx)
    // Skip empty/undefined values — emitting them would produce an image
    // content part with garbage data that providers reject.
    if (typeof val !== "string" || val.length === 0) return
    emitter.write(`${IMAGE_MARKER_START}${val}${IMAGE_MARKER_END}`)
  }
}

function parseMessages(raw: string): Message[] {
  const messages: Message[] = []
  const chatRegex = /\x01CHAT:(\w+)\x01([\s\S]*?)\x01ENDCHAT\x01/g
  let match

  while ((match = chatRegex.exec(raw)) !== null) {
    const role = match[1] as Message["role"]
    const body = match[2]

    if (role === "system") {
      messages.push({ role, content: body.trim() })
    } else {
      messages.push({ role, content: parseContentParts(body) })
    }
  }

  return messages
}

function parseContentParts(body: string): ContentPart[] {
  const parts: ContentPart[] = []
  const imageRegex = new RegExp(
    `${escapeRegex(IMAGE_MARKER_START)}(.*?)${escapeRegex(IMAGE_MARKER_END)}`,
    "g"
  )

  let lastIndex = 0
  let match

  while ((match = imageRegex.exec(body)) !== null) {
    const textBefore = body.slice(lastIndex, match.index)
    if (textBefore.trim()) {
      parts.push({ type: "text", text: textBefore.trim() })
    }
    parts.push({ type: "image", image: match[1] })
    lastIndex = match.index + match[0].length
  }

  const remaining = body.slice(lastIndex).trim()
  if (remaining) {
    parts.push({ type: "text", text: remaining })
  }

  return parts
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/**
 * Render a Liquid template string with the given context variables.
 * Useful for simple templates that don't use {% chat %} tags.
 */
export async function renderLiquidTemplate(
  template: string,
  context: Record<string, unknown>,
): Promise<string> {
  const liquid = new Liquid({ strictVariables: false })
  return liquid.parseAndRender(template, context)
}
