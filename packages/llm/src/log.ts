import { createHash } from "node:crypto"
import type { Message, TokenUsage } from "./types.js"

export interface LlmLogEntry {
  requestId: string
  timestamp: string
  taskType: string
  pageId?: string
  promptName: string
  modelId: string
  cacheHit: boolean
  success: boolean
  errorCount: number
  attempt: number
  durationMs: number
  usage?: TokenUsage
  validationErrors?: string[]
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
        const { width, height } = imageDimensions(base64)
        return { type: "image" as const, hash, byteLength, width, height }
      }
      return { type: "text" as const, text: part.text }
    })
    return { role: m.role, content: parts }
  })
}

/**
 * Read width and height from a base64-encoded image (PNG or JPEG).
 * Only decodes enough bytes to find the header.
 */
export function imageDimensions(base64: string): { width: number; height: number } {
  try {
    const buf = Buffer.from(base64.slice(0, 6000), "base64")
    if (buf.length < 4) return { width: 0, height: 0 }

    // PNG: bytes 0-3 = 0x89504E47, IHDR at 16 (width) and 20 (height)
    if (buf[0] === 0x89 && buf[1] === 0x50) {
      if (buf.length < 24) return { width: 0, height: 0 }
      return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
    }

    // JPEG: bytes 0-1 = 0xFFD8, scan for SOF0/SOF2 marker
    if (buf[0] === 0xff && buf[1] === 0xd8) {
      let i = 2
      while (i < buf.length - 9) {
        if (buf[i] !== 0xff) break
        const marker = buf[i + 1]
        if (marker === 0xc0 || marker === 0xc2) {
          return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) }
        }
        i += 2 + buf.readUInt16BE(i + 2)
      }
    }

    return { width: 0, height: 0 }
  } catch {
    return { width: 0, height: 0 }
  }
}

/** @deprecated Use imageDimensions instead. */
export const pngDimensions = imageDimensions
