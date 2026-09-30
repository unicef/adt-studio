import type { CoreMessage } from "ai"
import type { Message } from "../../../types.js"

/** System messages are carried separately by every port, so they are dropped here. */
export function toCoreMessages(messages: Message[]): CoreMessage[] {
  const result: CoreMessage[] = []
  for (const m of messages) {
    if (m.role === "system") continue

    if (typeof m.content === "string") {
      if (m.role === "user") {
        result.push({ role: "user", content: m.content })
      } else {
        result.push({ role: "assistant", content: m.content })
      }
      continue
    }

    if (m.role === "user") {
      const parts = m.content.map((p) =>
        p.type === "text"
          ? { type: "text" as const, text: p.text }
          : { type: "image" as const, image: p.image },
      )
      result.push({ role: "user", content: parts })
    } else {
      const textParts = m.content
        .filter((p) => p.type === "text")
        .map((p) => ({ type: "text" as const, text: p.text }))
      result.push({ role: "assistant", content: textParts })
    }
  }
  return result
}
