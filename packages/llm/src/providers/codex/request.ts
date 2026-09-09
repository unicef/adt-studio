import type { Message } from "../../types.js"
import { detectImageMediaType, stripDataUrl } from "../shared/image-media-type.js"
import { toJsonSchema as toSharedJsonSchema } from "../shared/json-schema.js"
import type { CodexCliImage } from "./cli.js"

const ROLE_LABELS: Record<"user" | "assistant", string> = {
  user: "User:",
  assistant: "Assistant:",
}

export function toJsonSchema(schema: unknown): Record<string, unknown> {
  return toSharedJsonSchema(schema, "Codex")
}

export interface CodexPromptInput {
  prompt: string
  /** In order of appearance; the prompt's "[Attached image N]" marker is `images[N - 1]`. */
  images: CodexCliImage[]
}

/**
 * `codex exec` only takes images as files (`--image`), attached to the prompt as
 * a whole rather than at a position inside it. Each inline image is therefore
 * collected for the runner to write out, and a numbered marker takes its place
 * in the text so the model can still tell which image a passage refers to.
 */
function toText(content: Message["content"], images: CodexCliImage[]): string {
  if (typeof content === "string") return content

  return content
    .map((part) => {
      if (part.type === "text") return part.text
      images.push({
        data: stripDataUrl(part.image),
        mediaType: detectImageMediaType(part.image),
      })
      return `[Attached image ${images.length}]`
    })
    .join("\n")
}

/**
 * The CLI takes one prompt string with no separate system channel, so the system
 * prompt is prepended and a multi-turn conversation is flattened into a labelled
 * transcript. System messages are dropped: every port carries them separately.
 */
export function toPromptInput(
  system: string | undefined,
  messages: Message[],
  schema: Record<string, unknown> | undefined,
): CodexPromptInput {
  const images: CodexCliImage[] = []
  const turns = messages.filter((message) => message.role !== "system")
  const transcript =
    turns.length === 1
      ? toText(turns[0]!.content, images)
      : turns
          .map(
            (turn) =>
              `${ROLE_LABELS[turn.role === "assistant" ? "assistant" : "user"]}\n${toText(turn.content, images)}`,
          )
          .join("\n\n")

  const instruction = schema
    ? `Reply with a single JSON object that validates against this JSON Schema. Emit no prose, no explanation and no code fences.\n\n${JSON.stringify(schema)}`
    : undefined

  return { prompt: [system, instruction, transcript].filter(Boolean).join("\n\n"), images }
}
