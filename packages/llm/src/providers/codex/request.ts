import type { Message } from "../../types.js"
import { toJsonSchema as toSharedJsonSchema } from "../shared/json-schema.js"

const ROLE_LABELS: Record<"user" | "assistant", string> = {
  user: "User:",
  assistant: "Assistant:",
}

export function toJsonSchema(schema: unknown): Record<string, unknown> {
  return toSharedJsonSchema(schema, "Codex")
}

function toText(content: Message["content"]): string {
  if (typeof content === "string") return content

  return content
    .map((part) => {
      if (part.type === "text") return part.text
      throw new Error(
        "Codex structured output cannot take inline images: the CLI accepts image files by path only",
      )
    })
    .join("\n")
}

/**
 * The CLI takes one prompt string with no separate system channel, so the system
 * prompt is prepended and a multi-turn conversation is flattened into a labelled
 * transcript. System messages are dropped: every port carries them separately.
 */
export function toPromptText(
  system: string | undefined,
  messages: Message[],
  schema: Record<string, unknown> | undefined,
): string {
  const turns = messages.filter((message) => message.role !== "system")
  const transcript =
    turns.length === 1
      ? toText(turns[0]!.content)
      : turns
          .map(
            (turn) =>
              `${ROLE_LABELS[turn.role === "assistant" ? "assistant" : "user"]}\n${toText(turn.content)}`,
          )
          .join("\n\n")

  const instruction = schema
    ? `Reply with a single JSON object that validates against this JSON Schema. Emit no prose, no explanation and no code fences.\n\n${JSON.stringify(schema)}`
    : undefined

  return [system, instruction, transcript].filter(Boolean).join("\n\n")
}
