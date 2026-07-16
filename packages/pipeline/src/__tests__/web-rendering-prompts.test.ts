import path from "node:path"
import { describe, expect, it } from "vitest"
import { createPromptEngine } from "@adt/llm"

describe("web-rendering prompts", () => {
  const engine = createPromptEngine(path.resolve(process.cwd(), "prompts"))
  const context = {
    page_image_base64: "",
    section_id: "section-1",
    section_type: "content",
    nodes: [],
    images: [],
    styleguide: "",
    book_fonts: [],
    viewports: [],
    user_instructions: "",
    intentional_reading_order: true,
  }

  it.each(["web_generation_html", "web_generation_html_overlay"])(
    "%s makes the user-chosen tree order authoritative",
    async (promptName) => {
      const messages = await engine.renderPrompt(promptName, context)
      const rendered = messages
        .map((message) => typeof message.content === "string" ? message.content : "")
        .join("\n")

      expect(rendered).toContain("USER-CHOSEN READING ORDER")
      expect(rendered).toContain("content tree order is authoritative")
      expect(rendered).toContain("even when that differs from the original page image")
    },
  )

  it("does not tell overlay rendering to restore original positions", async () => {
    const messages = await engine.renderPrompt("web_generation_html_overlay", context)
    const rendered = messages
      .map((message) => typeof message.content === "string" ? message.content : "")
      .join("\n")

    expect(rendered).toContain("position text overlays in the user-chosen sequence")
    expect(rendered).not.toContain("overlay text groups in their original locations")
    expect(rendered).not.toContain("use this to determine EXACT positions")
  })
})
