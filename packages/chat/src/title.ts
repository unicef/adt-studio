import type { ChatUiMessage } from "./types.js"

export const MAX_THREAD_TITLE_LENGTH = 60

export function firstUserText(messages: ChatUiMessage[]): string {
  for (const message of messages) {
    if (message.role !== "user") continue
    const text = message.parts
      .filter((part) => part.type === "text" && typeof part.text === "string")
      .map((part) => part.text as string)
      .join(" ")
      .trim()
    if (text) return text
  }
  return ""
}

export function deriveThreadTitle(source: string): string {
  const normalized = source.replace(/\s+/g, " ").trim()
  if (normalized.length <= MAX_THREAD_TITLE_LENGTH) return normalized
  return `${normalized.slice(0, MAX_THREAD_TITLE_LENGTH - 1).trimEnd()}…`
}
