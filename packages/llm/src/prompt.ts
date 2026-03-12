import {
  Liquid,
  Tag,
  type TagToken,
  type TopLevelToken,
  type Template,
  type Context,
  type Emitter,
} from "liquidjs"
import type { Message, ContentPart } from "./types.js"

const IMAGE_MARKER_START = "\x00IMG:"
const IMAGE_MARKER_END = "\x00"

export interface PromptEngine {
  renderPrompt(templateName: string, context: Record<string, unknown>): Promise<Message[]>
}

/**
 * Create a prompt engine that renders Liquid templates from a directory.
 * Supports custom {% chat %} and {% image %} tags.
 */
export function createPromptEngine(promptsDir: string | string[]): PromptEngine {
  const roots = Array.isArray(promptsDir) ? promptsDir : [promptsDir]
  const engine = new Liquid({
    root: roots,
    extname: ".liquid",
    strictVariables: false,
  })

  engine.registerTag("chat", createChatTag(engine))
  engine.registerTag("image", ImageTag)

  return {
    async renderPrompt(templateName: string, context: Record<string, unknown>): Promise<Message[]> {
      const raw = await engine.renderFile(templateName, context)
      return parseMessages(raw)
    },
  }
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
