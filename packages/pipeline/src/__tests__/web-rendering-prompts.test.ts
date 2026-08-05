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

  it("requires right-aligned page numbers and dotted leaders for TOC pages", async () => {
    const messages = await promptEngine.renderPrompt("web_generation_html", {
      ...generationContext(),
      section_type: "table_of_contents",
      nodes: [{ node_id: "toc_1", role: "text", text: "Digestive system1" }],
    })
    const prompt = messages.map(messageText).join("\n")

    expect(prompt).toContain("page number flush right")
    expect(prompt).toContain("dotted leader filling the space between")
    expect(prompt).toContain("Never put the leader after the page number")
    expect(prompt).toContain('text id=toc_1 "Digestive system1"')
  })

  it("does not add TOC-only layout rules to normal content pages", async () => {
    const messages = await promptEngine.renderPrompt(
      "web_generation_html",
      generationContext(),
    )
    const prompt = messages.map(messageText).join("\n")

    expect(prompt).not.toContain("TABLE OF CONTENTS LAYOUT")
  })

  it("requires visual review to preserve corrected TOC rows", async () => {
    const messages = await promptEngine.renderPrompt("visual_review", {
      nodes: [{ node_id: "toc_1", role: "text", text: "Digestive system1" }],
      section_type: "table_of_contents",
      has_merged_content: false,
      viewports: [{ label: "Desktop", width: 1280, tailwind_prefix: "" }],
    })
    const prompt = messages.map(messageText).join("\n")

    expect(prompt).toContain("TABLE OF CONTENTS REVIEW")
    expect(prompt).toContain("page number at the far right")
    expect(prompt).toContain("Do not remove a correct dotted-leader row")
  })

  for (const promptName of ["web_generation_html", "web_generation_html_overlay"]) {
    it(`${promptName} requires accessible controls for mixed-page exercises`, async () => {
      const messages = await promptEngine.renderPrompt(promptName, {
        ...generationContext(),
        nodes: [{ node_id: "q1", role: "activity_question", text: "Name the animal." }],
      })
      const prompt = messages.map(messageText).join("\n")

      expect(prompt).toContain("one text input below EACH picture")
      expect(prompt).toContain('data-activity-item="item-N"')
      expect(prompt).toContain("at least 44px high")
      expect(prompt).toContain("provide an optional response field")
      expect(prompt).toContain("NOT acceptable visible output")
      expect(prompt).toContain("exact sentence position with an inline input")
      expect(prompt).toContain("Never move passage blanks into a separate questionnaire")
      expect(prompt).toContain("conversations and dialogues containing blanks as exercises")
      expect(prompt).toContain("MUST NOT be the only way to answer")
      expect(prompt).toContain("selectable answer chips and usable drop targets")
      expect(prompt).toContain("focus a blank, then press Enter")
      expect(prompt).toContain("live status region")
      expect(prompt).toContain("remove the decorative underline/dash")
      expect(prompt).toContain("continue onto an adjacent page")
      expect(prompt).toContain("repeat the complete choice bank")
      expect(prompt).toContain("text-only tables and timetables as semantic HTML tables")
      expect(prompt).toContain("meaningful alt text")
    })
  }

  it("requires visual review to preserve usable exercise controls", async () => {
    const messages = await promptEngine.renderPrompt("visual_review", {
      nodes: [{ node_id: "q1", role: "activity_question", text: "Name the animal." }],
      section_type: "text_and_images",
      has_merged_content: false,
      viewports: [{ label: "Desktop", width: 1280, tailwind_prefix: "" }],
    })
    const prompt = messages.map(messageText).join("\n")

    expect(prompt).toContain("reject any exercise with a missing response control")
    expect(prompt).toContain("picture input collapsed beside the image")
    expect(prompt).toContain("clipped at mobile width")
    expect(prompt).toContain("a visible screenshot/crop used instead of semantic exercise HTML")
  })
})
