import { createHash } from "node:crypto"
import type { Message, TokenUsage } from "./types.js"

export interface LlmLogEntry {
  timestamp: string
  taskType: string
  pageId?: string
  promptName: string
  modelId: string
  cacheHit: boolean
  attempt: number
  durationMs: number
  usage?: TokenUsage
  validationErrors?: string[]
  system?: string
  messages: LlmLogMessage[]
}

export interface LlmLogMessage {
  role: string
  content: (LlmLogTextPart | LlmLogImagePlaceholder)[]
}

interface LlmLogTextPart {
  type: "text"
  text: string
}

export interface LlmLogImagePlaceholder {
  type: "image"
  hash: string
  byteLength: number
  width: number
  height: number
}

/**
 * Replace base64 image data in messages with compact placeholders
 * that record the hash, byte length, and dimensions.
 */
export function sanitizeMessages(messages: Message[]): LlmLogMessage[] {
  return messages.map((m) => {
    if (typeof m.content === "string") {
      return { role: m.role, content: [{ type: "text" as const, text: m.content }] }
    }
    const parts = m.content.map((part) => {
      if (part.type === "image") {
        const base64 = part.image
        const hash = createHash("sha256").update(base64).digest("hex").slice(0, 16)
        const byteLength = Math.round((base64.length * 3) / 4)
        const { width, height } = pngDimensions(base64)
        return { type: "image" as const, hash, byteLength, width, height }
      }
      return { type: "text" as const, text: part.text }
    })
    return { role: m.role, content: parts }
  })
}

/**
 * Read PNG width and height from the IHDR chunk in a base64-encoded PNG.
 * Width is at byte offset 16, height at 20 (both big-endian uint32).
 * Only decodes the first 24 bytes (32 base64 chars).
 */
export function pngDimensions(base64: string): { width: number; height: number } {
  try {
    const buf = Buffer.from(base64.slice(0, 32), "base64")
    if (buf.length < 24) return { width: 0, height: 0 }
    const width = buf.readUInt32BE(16)
    const height = buf.readUInt32BE(20)
    return { width, height }
  } catch {
    return { width: 0, height: 0 }
  }
}
