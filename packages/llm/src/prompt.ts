import { resolvePromptFile, resolvePromptModelId } from "./prompt-resolution.js"
export { resolvePromptModelId, promptModelFolderName, promptNameForModel } from "./prompt-resolution.js"
import {
  Liquid,
  Tag,
  type TagToken,
  type TopLevelToken,
  type Template,
  type Context,
  type Emitter,
} from "liquidjs"
import { DEFAULT_BASE_PROMPT_MODEL_ID, PromptName } from "@adt/types"
import type { Message, ContentPart } from "./types.js"

const IMAGE_MARKER_START = "\x00IMG:"
const IMAGE_MARKER_END = "\x00"
export interface CreatePromptEngineOptions {
  /** Model the base templates target; steps on it skip variant lookup.
   *  Defaults to DEFAULT_BASE_PROMPT_MODEL_ID. */
  basePromptModelId?: string
}

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
export function createPromptEngine(
  promptsDir: string | string[],
  options?: CreatePromptEngineOptions,
): PromptEngine {
  const roots = Array.isArray(promptsDir) ? promptsDir : [promptsDir]
  const basePromptModelId = options?.basePromptModelId ?? DEFAULT_BASE_PROMPT_MODEL_ID

  return {
    resolvePrompt(templateName: string, renderOptions?: PromptRenderOptions): PromptResolution {
      return resolvePromptTemplate(roots, templateName, renderOptions, basePromptModelId)
    },

    async renderPrompt(
      templateName: string,
      context: Record<string, unknown>,
      renderOptions?: PromptRenderOptions,
    ): Promise<Message[]> {
      const raw = renderPromptText(roots, templateName, context, renderOptions?.modelId, basePromptModelId)
      return parseMessages(raw)
    },
  }
}

/** Render raw image prompts and chat prompts with the same selected includes.
 * Rendering is synchronous before the first provider await; repeated includes
 * retain the exact bytes captured by this render, even if a writer publishes. */
export function renderPromptText(
  roots: string[], name: string, context: Record<string, unknown>,
  requestedModel?: string, basePromptModelId = DEFAULT_BASE_PROMPT_MODEL_ID,
): string {
  const model = resolvePromptModelId(requestedModel, basePromptModelId)
  const captured = new Map<string, string | null>()
  const read = (file: string): string | null => {
    const candidate = file.replace(/\.liquid$/, "")
    PromptName.parse(candidate)
    if (!captured.has(candidate)) captured.set(candidate, resolvePromptFile(roots, candidate, model)?.content ?? null)
    return captured.get(candidate) ?? null
  }
  const template = read(name)
  if (template == null) throw new Error(`Prompt template not found: ${name}`)
  const engine = new Liquid({
    root: [""], extname: ".liquid", strictVariables: false, relativeReference: false,
    fs: {
      resolve: (_dir, file) => file,
      existsSync: (file) => read(file) != null,
      exists: async (file) => read(file) != null,
      readFileSync: (file) => {
        const content = read(file)
        if (content == null) throw new Error(`Prompt include not found: ${file}`)
        return content
      },
      readFile: async (file) => {
        const content = read(file)
        if (content == null) throw new Error(`Prompt include not found: ${file}`)
        return content
      },
    },
  })
  engine.registerTag("chat", createChatTag(engine))
  engine.registerTag("image", ImageTag)
  return engine.parseAndRenderSync(template, context)
}

function resolvePromptTemplate(
  roots: string[], templateName: string, options?: PromptRenderOptions,
  basePromptModelId: string = DEFAULT_BASE_PROMPT_MODEL_ID,
): PromptResolution {
  const resolved = resolvePromptFile(roots, templateName, resolvePromptModelId(options?.modelId, basePromptModelId))
  if (!resolved) throw new Error(`Prompt template not found: ${templateName}`)
  return resolved
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
    const val = this.liquid.evalValueSync(this.value, ctx)
    // Only emit an image marker for a real, non-empty string. A missing or
    // empty Liquid expression would otherwise inject the literal string
    // "undefined" (or "") as the image payload — which the LLM SDK rejects
    // with the cryptic "Content string is not a base64-encoded media." Skipping
    // lets templates reference optional images (e.g. `{% image page_image_base64 %}`)
    // without wrapping every use in an `{% if %}`. `.trim()` also drops
    // whitespace-only values, which are equally invalid base64.
    if (typeof val !== "string" || val.trim() === "") return
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
