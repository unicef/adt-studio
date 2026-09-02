import type { Message } from "../../types.js"
import {
  toJsonSchema as toSharedJsonSchema,
  type ZodLike,
} from "../shared/json-schema.js"
import type { ClaudeAgentContentBlock } from "./cli.js"

export { asZodLike } from "../shared/json-schema.js"
export type { ZodLike }

const ROLE_LABELS: Record<"user" | "assistant", string> = {
  user: "User:",
  assistant: "Assistant:",
}

const DATA_URL_PATTERN = /^data:(image\/[a-z0-9.+-]+);base64,/i

const BASE64_MAGIC_MEDIA_TYPES: ReadonlyArray<[string, string]> = [
  ["iVBORw0KGgo", "image/png"],
  ["/9j/", "image/jpeg"],
  ["R0lGOD", "image/gif"],
  ["UklGR", "image/webp"],
]

export function detectImageMediaType(image: string): string {
  const dataUrl = DATA_URL_PATTERN.exec(image)
  if (dataUrl) return dataUrl[1]!.toLowerCase()

  for (const [prefix, mediaType] of BASE64_MAGIC_MEDIA_TYPES) {
    if (image.startsWith(prefix)) return mediaType
  }
  return "image/png"
}

function stripDataUrl(image: string): string {
  return image.replace(DATA_URL_PATTERN, "")
}

function toBlocks(content: Message["content"]): ClaudeAgentContentBlock[] {
  if (typeof content === "string") {
    return content ? [{ type: "text", text: content }] : []
  }

  return content.map((part) =>
    part.type === "text"
      ? { type: "text" as const, text: part.text }
      : {
          type: "image" as const,
          source: {
            type: "base64" as const,
            media_type: detectImageMediaType(part.image),
            data: stripDataUrl(part.image),
          },
        },
  )
}

/**
 * The agent harness takes one prompt, so a multi-turn conversation is flattened
 * into a labelled transcript. System messages are dropped: every port carries
 * the system prompt separately.
 */
export function toPromptBlocks(messages: Message[]): ClaudeAgentContentBlock[] {
  const turns = messages.filter((message) => message.role !== "system")
  if (turns.length === 0) return []
  if (turns.length === 1) return toBlocks(turns[0]!.content)

  const blocks: ClaudeAgentContentBlock[] = []
  for (const turn of turns) {
    const role = turn.role === "assistant" ? "assistant" : "user"
    blocks.push({ type: "text", text: ROLE_LABELS[role] }, ...toBlocks(turn.content))
  }
  return blocks
}

export function toJsonSchema(schema: unknown): Record<string, unknown> {
  return toSharedJsonSchema(schema, "Claude Agent")
}
