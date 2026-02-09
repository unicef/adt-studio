import { describe, it, expect } from "vitest"
import { sanitizeMessages, pngDimensions } from "../log.js"
import type { Message } from "../types.js"

describe("sanitizeMessages", () => {
  it("preserves text-only messages", () => {
    const messages: Message[] = [
      { role: "system", content: "You are helpful" },
      { role: "user", content: "Hello" },
    ]
    const sanitized = sanitizeMessages(messages)
    expect(sanitized).toEqual([
      { role: "system", content: [{ type: "text", text: "You are helpful" }] },
      { role: "user", content: [{ type: "text", text: "Hello" }] },
    ])
  })

  it("replaces image data with placeholder", () => {
    const fakeBase64 = "AAAA".repeat(100)
    const messages: Message[] = [
      {
        role: "user",
        content: [
          { type: "text", text: "Look at this:" },
          { type: "image", image: fakeBase64 },
        ],
      },
    ]
    const sanitized = sanitizeMessages(messages)
    expect(sanitized).toHaveLength(1)
    const parts = sanitized[0].content
    expect(parts).toHaveLength(2)
    expect(parts[0]).toEqual({ type: "text", text: "Look at this:" })
    expect(parts[1].type).toBe("image")
    const imgPart = parts[1] as { type: "image"; hash: string; byteLength: number }
    expect(imgPart.hash).toHaveLength(16) // truncated SHA-256
    expect(imgPart.byteLength).toBeGreaterThan(0)
  })
})

describe("pngDimensions", () => {
  it("returns 0x0 for non-PNG data", () => {
    expect(pngDimensions("not-png-data")).toEqual({ width: 0, height: 0 })
  })

  it("returns 0x0 for empty string", () => {
    expect(pngDimensions("")).toEqual({ width: 0, height: 0 })
  })
})
