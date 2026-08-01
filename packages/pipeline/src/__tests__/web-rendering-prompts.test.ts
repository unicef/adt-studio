import path from "node:path"
import { describe, expect, it } from "vitest"
import { createPromptEngine } from "@adt/llm"
import type { Message } from "@adt/llm"

const promptEngine = createPromptEngine(path.join(process.cwd(), "prompts"))

const nodes = [
  {
    node_id: "rescue_group",
    structure: "group",
    children: [
      { node_id: "rescue_heading", role: "heading", text: "Rescue" },
    ],
  },
  {
    node_id: "sense_group",
    structure: "group",
    children: [
      { node_id: "sense_heading", role: "heading", text: "Sense" },
    ],
  },
]

function messageText(message: Message | undefined): string {
  if (!message) return ""
  if (typeof message.content === "string") return message.content
  return message.content
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n")
}

function generationContext(): Record<string, unknown> {
  return {
    page_image_base64: "page-image",
    source_pages: [],
    section_id: "pg006_sec001",
    section_type: "text_and_images",
    images: [],
    nodes,
    styleguide: "",
    book_fonts: [],
    typography: [],
    viewports: [{ label: "Desktop", width: 1280, tailwind_prefix: "" }],
    user_instructions: "",
  }
}

describe("web rendering reading-order prompts", () => {
  for (const promptName of [
    "web_generation_html",
    "web_generation_html_overlay",
  ]) {
    it(`${promptName} makes the saved tree authoritative`, async () => {
      const messages = await promptEngine.renderPrompt(
        promptName,
        generationContext(),
      )
      const prompt = messages.map(messageText).join("\n")

      expect(prompt).toContain("content tree wins")
      expect(prompt).toContain("Never restore or infer an older order")
      expect(prompt.indexOf('heading id=rescue_heading "Rescue"')).toBeLessThan(
        prompt.indexOf('heading id=sense_heading "Sense"'),
      )
    })
  }

  it("gives the visual reviewer the same authoritative tree", async () => {
    const messages = await promptEngine.renderPrompt("visual_review", {
      nodes,
      has_merged_content: false,
      viewports: [{ label: "Desktop", width: 1280, tailwind_prefix: "" }],
    })
    const prompt = messages.map(messageText).join("\n")

    expect(prompt).toContain("Reject a rendering")
    expect(prompt).toContain("content tree wins")
    expect(prompt.indexOf('heading id=rescue_heading "Rescue"')).toBeLessThan(
      prompt.indexOf('heading id=sense_heading "Sense"'),
    )
  })

  it("preserves separated labels as an accessible labeled diagram", async () => {
    const diagramNodes = [{
      node_id: "diagram_group",
      structure: "image_group",
      children: [
        { node_id: "diagram_image", role: "image", image_id: "diagram_image" },
        { node_id: "label_1", role: "label", text: "Mouth cavity" },
        { node_id: "label_2", role: "label", text: "Pharynx" },
        { node_id: "caption_1", role: "caption", text: "The digestive system" },
      ],
    }]
    const messages = await promptEngine.renderPrompt("web_generation_html", {
      ...generationContext(),
      nodes: diagramNodes,
    })
    const prompt = messages.map(messageText).join("\n")

    expect(prompt).toContain("LABELED DIAGRAMS (VISUAL FIDELITY + INCLUSIVE ACCESS)")
    expect(prompt).toContain("A short horizontal rule that stops in empty space")
    expect(prompt).toContain("numbered high-contrast markers")
    expect(prompt).toContain("preserving those connections is REQUIRED")
    expect(prompt).toContain("must not contain trailing borders")
    expect(prompt).toContain("Required leader structure example")
    expect(prompt).toContain("do not add separate `h-px`")
    expect(prompt).toContain("PROVIDED EXTRACTED IMAGE itself")
    expect(prompt).toContain("Never put those labels in `sr-only`")
    expect(prompt).toContain('<figure data-labeled-diagram>')
    expect(prompt).toContain('<ul aria-label="Diagram parts">')
    expect(prompt).toContain("keyboard and screen-reader users")
  })

  it("requires visual review to reject labels lost during image extraction", async () => {
    const messages = await promptEngine.renderPrompt("visual_review", {
      nodes,
      has_merged_content: false,
      viewports: [{ label: "Desktop", width: 1280, tailwind_prefix: "" }],
    })
    const prompt = messages.map(messageText).join("\n")

    expect(prompt).toContain("Labeled diagrams whose labels/callouts")
    expect(prompt).toContain("not inside the crop")
    expect(prompt).toContain("screen-reader-readable parts list")
    expect(prompt).toContain("reject short rules that hang in whitespace")
    expect(prompt).toContain("reject replacing them with an unconnected parts list")
  })
})
