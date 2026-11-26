import { describe, expect, it } from "vitest"
import { ChatSendRequest } from "../chat.js"

const IMAGE = "data:image/png;base64,iVBORw0KGgo="

describe("ChatSendRequest", () => {
  it("accepts a message with only images", () => {
    expect(ChatSendRequest.parse({ text: "", images: [IMAGE] })).toMatchObject({ text: "", images: [IMAGE], mode: "manual" })
  })

  it("rejects an empty message, non-image data and too many images", () => {
    expect(ChatSendRequest.safeParse({ text: "  " }).success).toBe(false)
    expect(ChatSendRequest.safeParse({ text: "hi", images: ["data:text/html;base64,PGI+"] }).success).toBe(false)
    expect(ChatSendRequest.safeParse({ text: "hi", images: Array(5).fill(IMAGE) }).success).toBe(false)
  })
})
