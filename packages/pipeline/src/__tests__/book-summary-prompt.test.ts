import path from "node:path"
import { describe, expect, it } from "vitest"
import { createPromptEngine } from "@adt/llm"
import type { Message } from "@adt/llm"

const promptEngine = createPromptEngine(path.join(process.cwd(), "prompts"))

const language = { output_language: "Spanish", output_language_code: "es" }

function userParts(messages: Message[]): Array<{ type: string; text?: string; image?: string }> {
  const user = messages.find((message) => message.role === "user")
  if (!user || typeof user.content === "string") throw new Error("user message has no parts")
  return user.content as Array<{ type: string; text?: string; image?: string }>
}

describe("book_summary prompt", () => {
  it("sends page text only for a book with a text layer", async () => {
    const messages = await promptEngine.renderPrompt("book_summary", {
      ...language,
      pages: [
        { pageNumber: 1, text: "Capítulo uno" },
        { pageNumber: 2, text: "Capítulo dos […]" },
      ],
      page_renders: [],
    })
    expect(messages[0].role).toBe("system")
    expect(messages[0].content).toContain("Spanish (es)")
    const parts = userParts(messages)
    expect(parts.filter((part) => part.type === "image")).toHaveLength(0)
    const text = parts.map((part) => part.text ?? "").join("\n")
    expect(text).toContain("--- Page 1 ---\nCapítulo uno")
    expect(text).toContain("--- Page 2 ---\nCapítulo dos […]")
    expect(text).not.toContain("no extractable text layer")
    expect(text).not.toContain("(image)")
  })

  it("sends page images and says so for a book without a text layer", async () => {
    const messages = await promptEngine.renderPrompt("book_summary", {
      ...language,
      pages: [],
      page_renders: [
        { pageNumber: 1, imageBase64: "AAAA" },
        { pageNumber: 50, imageBase64: "BBBB" },
      ],
    })
    const parts = userParts(messages)
    const images = parts.filter((part) => part.type === "image").map((part) => part.image)
    expect(images).toEqual(["AAAA", "BBBB"])
    const text = parts.map((part) => part.text ?? "").join("\n")
    expect(text).toContain("no extractable text layer")
    expect(text).toContain("--- Page 1 (image) ---")
    expect(text).toContain("--- Page 50 (image) ---")
    expect(text).not.toContain("Here is the extracted text")
  })

  it("sends both, with the images introduced, for a mostly scanned book", async () => {
    const messages = await promptEngine.renderPrompt("book_summary", {
      ...language,
      pages: [{ pageNumber: 3, text: "Only this page has text" }],
      page_renders: [{ pageNumber: 1, imageBase64: "AAAA" }],
    })
    const parts = userParts(messages)
    expect(parts.filter((part) => part.type === "image")).toHaveLength(1)
    const text = parts.map((part) => part.text ?? "").join("\n")
    expect(text).toContain("--- Page 3 ---\nOnly this page has text")
    expect(text).toContain("Most pages have no extractable text")
    expect(text).toContain("--- Page 1 (image) ---")
  })

  it("never emits an image part for a missing render payload", async () => {
    const messages = await promptEngine.renderPrompt("book_summary", {
      ...language,
      pages: [],
      page_renders: [{ pageNumber: 1, imageBase64: "" }],
    })
    expect(userParts(messages).filter((part) => part.type === "image")).toHaveLength(0)
  })
})
