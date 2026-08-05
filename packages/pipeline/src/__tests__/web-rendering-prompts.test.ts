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
})

describe("page-mode visual review prompt", () => {
  it("preserves overlapping image components as one responsive figure", async () => {
    const messages = await promptEngine.renderPrompt("visual_review_page", {})
    const prompt = messages.map(messageText).join("\n")

    expect(prompt).toContain("treat them as layers of one responsive figure")
    expect(prompt).toContain("Never stack coordinate-linked layers vertically")
    expect(prompt).toContain("inline percentage positioning is allowed")
    expect(prompt).toContain("Never synthesize, redraw, trace, approximate, or imitate a signature")
    expect(prompt).toContain("leave the mark absent")
  })

  it("frames non-activity sections as one complete page with an approval bar", async () => {
    const messages = await promptEngine.renderPrompt("visual_review_page", {
      is_activity: false,
      has_merged_content: false,
      viewports: [{ label: "Desktop", width: 1280, tailwind_prefix: "" }],
    })
    const prompt = messages.map(messageText).join("\n")

    expect(prompt).toContain("one complete source page")
    expect(prompt).toContain("WHEN TO APPROVE")
    expect(prompt).toContain("Approval does NOT require pixel identity")
    expect(prompt).not.toContain("INTERACTIVE ACTIVITY")
  })

  it("protects the fixed type scale and sr-only text", async () => {
    const messages = await promptEngine.renderPrompt("visual_review_page", {})
    const prompt = messages.map(messageText).join("\n")

    expect(prompt).toContain("Keep EVERY `adt-*` class")
    expect(prompt).toContain("`sr-only`")
    expect(prompt).toContain("must contain only literal text")
  })
})

describe("visual review activity awareness", () => {
  const viewports = [
    { label: "Desktop", width: 1280, tailwind_prefix: "" },
    { label: "Mobile", width: 375, tailwind_prefix: "max-sm" },
  ]

  for (const promptName of ["visual_review", "visual_review_page"]) {
    it(`${promptName} carves out interactive activities`, async () => {
      const messages = await promptEngine.renderPrompt(promptName, {
        nodes,
        has_merged_content: false,
        is_activity: true,
        section_type: "activity_multiple_choice",
        viewports,
      })
      const prompt = messages.map(messageText).join("\n")

      expect(prompt).toContain("THIS SECTION IS AN INTERACTIVE ACTIVITY")
      expect(prompt).toContain("NEVER remove, hide, or disable an interactive element")
      expect(prompt).toContain("data-activity-item")
      expect(prompt).toContain("Do NOT compare the controls element-for-element against the print page")
    })

    it(`${promptName} omits the activity carve-out for regular sections`, async () => {
      const messages = await promptEngine.renderPrompt(promptName, {
        nodes,
        has_merged_content: false,
        is_activity: false,
        section_type: "text_only",
        viewports,
      })
      const prompt = messages.map(messageText).join("\n")

      expect(prompt).not.toContain("THIS SECTION IS AN INTERACTIVE ACTIVITY")
    })

    it(`${promptName} explains merged continuation pages`, async () => {
      const messages = await promptEngine.renderPrompt(promptName, {
        nodes,
        has_merged_content: true,
        is_activity: false,
        viewports,
      })
      const prompt = messages.map(messageText).join("\n")

      expect(prompt).toContain("MERGED CONTENT FROM ANOTHER PAGE")
      expect(prompt).toContain("do NOT remove it")
    })

    it(`${promptName} restricts responsive prefixes to the screenshot viewports`, async () => {
      const messages = await promptEngine.renderPrompt(promptName, {
        nodes,
        has_merged_content: false,
        is_activity: false,
        viewports,
      })
      const prompt = messages.map(messageText).join("\n")

      expect(prompt).toContain("use ONLY the breakpoint prefixes listed above")
      expect(prompt).toContain("**Mobile**: 375px → `max-sm` prefix")
    })
  }
})

describe("page-mode sectioning split", () => {
  function sectioningContext(mode: string): Record<string, unknown> {
    return {
      mode,
      structure_types: [],
      role_types: [],
      section_types: [],
      page: { pageNumber: 1, text: "", imageBase64: "page-image" },
      images: [],
    }
  }

  it("allows splitting page-mode pages by activity mechanic", async () => {
    const messages = await promptEngine.renderPrompt(
      "page_sectioning",
      sectioningContext("page"),
    )
    const prompt = messages.map(messageText).join("\n")

    expect(prompt).toContain("EXCEPTION — MIXED ACTIVITY MECHANICS")
    expect(prompt).toContain("one section per mechanic")
    expect(prompt).toContain("NEVER roll mixed mechanics up under `activity_other`")
    expect(prompt).not.toContain("Do NOT split the page under any circumstance")
  })

  it("keeps the refinement check consistent with the page-mode exception", async () => {
    const messages = await promptEngine.renderPrompt("page_sectioning_refinement", {
      mode: "page",
      max_refinements: 1,
      structure_types: [],
      role_types: [],
      section_types: [],
      page: { pageNumber: 1, text: "", imageBase64: "page-image" },
      images: [],
      candidate: { reasoning: "", sections_json: "[]" },
      prior_notes: [],
      iteration: 1,
    })
    const prompt = messages.map(messageText).join("\n")

    expect(prompt).toContain("one section per mechanic")
    expect(prompt).toContain("Any other split is an error")
  })
})

describe("image meaningfulness prompt", () => {
  it("preserves signatures and other authenticity marks", async () => {
    const messages = await promptEngine.renderPrompt("image_meaningfulness", {
      page_image_base64: "page-image",
      images: [],
    })
    const prompt = messages.map(messageText).join("\n")

    expect(prompt).toContain("identity/authenticity mark")
    expect(prompt).toContain("must be preserved exactly")
    expect(prompt).toContain("Never classify a signature")
  })
})
