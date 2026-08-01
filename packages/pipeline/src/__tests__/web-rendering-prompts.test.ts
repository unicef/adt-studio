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

  it("requires accessible controls for every mechanic on a mixed exercise page", async () => {
    const messages = await promptEngine.renderPrompt("web_generation_html", {
      ...generationContext(),
      section_type: "activity_mixed",
    })
    const prompt = messages.map(messageText).join("\n")

    expect(prompt).toContain("MIXED EXERCISE PAGE — REQUIRED INTERACTIVITY")
    expect(prompt).toContain("data-activity-kind")
    expect(prompt).toContain("one `<fieldset>` per question")
    expect(prompt).toContain("exactly two labelled radios")
    expect(prompt).toContain("MUST visibly spell out")
    expect(prompt).toContain("Never show only initials")
    expect(prompt).toContain("data-question-response")
    expect(prompt).toContain("immediately follows the question")
  })

  it("prevents stage headings and experiment labels from overlapping prose on mobile", async () => {
    const messages = await promptEngine.renderPrompt(
      "web_generation_html",
      generationContext(),
    )
    const prompt = messages.map(messageText).join("\n")

    expect(prompt).toContain("vertical definition sequence")
    expect(prompt).toContain("marker and heading in one full-width row")
    expect(prompt).toContain("Never preserve a fixed/narrow heading column")
    expect(prompt).toContain("Scientific experiment/procedure callouts")
    expect(prompt).toContain("Aim, Materials, Procedure")

    const reviewMessages = await promptEngine.renderPrompt("visual_review", {
      nodes,
      has_merged_content: false,
      viewports: [{ label: "Mobile", width: 390, tailwind_prefix: "max-sm:" }],
    })
    const reviewPrompt = reviewMessages.map(messageText).join("\n")
    expect(reviewPrompt).toContain("Repeated stage/definition entries")
    expect(reviewPrompt).toContain("Scientific experiment callouts flattened")
  })

  it("requires full-width dotted leaders on every table-of-contents page", async () => {
    const messages = await promptEngine.renderPrompt("web_generation_html", {
      ...generationContext(),
      section_type: "table_of_contents",
    })
    const prompt = messages.map(messageText).join("\n")
    expect(prompt).toContain("TABLE OF CONTENTS — REQUIRED ROW GEOMETRY")
    expect(prompt).toContain("flexible dotted leader filling ALL remaining space")
    expect(prompt).toContain("continuation pages")
    expect(prompt).toContain("border-dotted")
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
    expect(prompt).toContain("Required unified structure example")
    expect(prompt).toContain("BOTH ends must visibly touch")
    expect(prompt).toContain("opaque background matching its surrounding panel")
    expect(prompt).toContain("ONE unified, aspect-ratio-preserving SVG coordinate system")
    expect(prompt).toContain("<foreignObject")
    expect(prompt).toContain('data-label-contact="start"')
    expect(prompt).toContain("underlap is masked at the label edge")
    expect(prompt).toContain("separate `h-px`")
    expect(prompt).toContain("PROVIDED EXTRACTED IMAGE itself")
    expect(prompt).toContain("Never put those labels in `sr-only`")
    expect(prompt).toContain('<figure data-labeled-diagram>')
    expect(prompt).toContain('aria-label="Diagram parts"')
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
    expect(prompt).toContain("screen-reader-readable parts structure")
    expect(prompt).toContain("reject any whitespace gap at the label edge")
    expect(prompt).toContain("a line crossing through label glyphs")
    expect(prompt).toContain("a label with no corresponding leader")
    expect(prompt).toContain("one unified SVG")
    expect(prompt).toContain("Check desktop and tablet widths")
    expect(prompt).toContain("reject replacing them with an unconnected parts list")
  })

  it("preserves recurring page chrome without exposing decoration to assistive technology", async () => {
    const generationMessages = await promptEngine.renderPrompt(
      "web_generation_html",
      generationContext(),
    )
    const generationPrompt = generationMessages.map(messageText).join("\n")

    expect(generationPrompt).toContain("Recurring page chrome is part of the book's identity")
    expect(generationPrompt).toContain("span this section's FULL height")
    expect(generationPrompt).toContain('aria-hidden="true"')
    expect(generationPrompt).toContain("pointer-events-none")
    expect(generationPrompt).toContain("mobile and 200% zoom")
    expect(generationPrompt).toContain("Do not invent a rail or color")
    expect(generationPrompt).toContain("role-to-color mapping")

    const reviewMessages = await promptEngine.renderPrompt("visual_review", {
      nodes,
      has_merged_content: false,
      viewports: [{ label: "Desktop", width: 1280, tailwind_prefix: "" }],
    })
    const reviewPrompt = reviewMessages.map(messageText).join("\n")

    expect(reviewPrompt).toContain("Missing, shortened, interrupted, wrongly colored")
    expect(reviewPrompt).toContain("generic white/card treatment")
    expect(reviewPrompt).toContain("pollutes accessibility")
    expect(reviewPrompt).toContain("does NOT apply to missing or inconsistent recurring page-edge chrome")
  })

  it("keeps each standalone activity response attached to its prompt", async () => {
    const messages = await promptEngine.renderPrompt("activity_open_ended_answer", {
      ...generationContext(),
      section_type: "activity_open_ended_answer",
      text_ids: ["q1"],
      image_ids: [],
    })
    const prompt = messages.map(messageText).join("\n")

    expect(prompt).toContain('data-question-response="item-N"')
    expect(prompt).toContain("directly BELOW the question")
    expect(prompt).toContain("Never collect answer fields at the bottom")
    expect(prompt).toContain("200% zoom")
  })

  it("keeps meaningful images legible on mobile and content discoverable downstream", async () => {
    const messages = await promptEngine.renderPrompt(
      "web_generation_html",
      generationContext(),
    )
    const prompt = messages.map(messageText).join("\n")

    expect(prompt).toContain("MEANINGFUL IMAGES ON SMALL SCREENS")
    expect(prompt).toContain("at least about 80%")
    expect(prompt).toContain("max-sm:w-full max-sm:max-w-none h-auto")
    expect(prompt).toContain("DOWNSTREAM DISCOVERABILITY + INCLUSIVE ACCESS")
    expect(prompt).toContain("Image Captions, Language, Speech/Voice")
    expect(prompt).toContain('Do NOT add `tabindex="0"` to ordinary words')
    expect(prompt).toContain("Custom interactive regions")
  })
})
