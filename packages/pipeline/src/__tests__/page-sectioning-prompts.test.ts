import path from "node:path"
import { describe, expect, it } from "vitest"
import { createPromptEngine } from "@adt/llm"
import type { Message } from "@adt/llm"

const promptEngine = createPromptEngine(path.join(process.cwd(), "prompts"))

function messageText(message: Message | undefined): string {
  if (!message) return ""
  if (typeof message.content === "string") return message.content
  return message.content
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n")
}

const typeDefs = {
  structure_types: [{ key: "paragraph", description: "Paragraph" }],
  role_types: [{ key: "text", description: "Body text" }],
  section_types: [{ key: "text_only", description: "Reading section" }],
}

function sectioningContext(mode: "page" | "dynamic"): Record<string, unknown> {
  return {
    page: { pageNumber: 12, text: "Page text", imageBase64: "page-image" },
    images: [],
    ...typeDefs,
    mode,
  }
}

function refinementContext(mode: "page" | "dynamic"): Record<string, unknown> {
  return {
    page: { pageNumber: 12, text: "Page text", imageBase64: "page-image" },
    images: [],
    ...typeDefs,
    mode,
    max_refinements: 2,
    iteration: 1,
    prior_notes: [],
    candidate: { reasoning: "why", sections_json: "[]" },
  }
}

async function render(
  promptName: string,
  context: Record<string, unknown>,
): Promise<string> {
  const messages = await promptEngine.renderPrompt(promptName, context)
  return messages.map(messageText).join("\n")
}

describe("page_sectioning mode branches", () => {
  it("dynamic mode instructs splitting reading pages at a semantic boundary", async () => {
    const prompt = await render("page_sectioning", sectioningContext("dynamic"))

    expect(prompt).toContain("READING PAGE THAT CROSSES A BOUNDARY")
    expect(prompt).toContain("GENUINE SEMANTIC BOUNDARY")
    expect(prompt).toContain("THE DECIDING TEST IS THE BOUNDARY")
    // Guardrail keeping downstream per-section cost bounded.
    expect(prompt).toContain("AT MOST 3 sections")
    expect(prompt).toContain("Worked example: a story page that changes scene")
    expect(prompt).toContain("Worked example: a reading page with a mid-page subheading")
    expect(prompt).toContain("Counter-example: a long page with no boundary")
  })

  it("dynamic mode calibrates the length floor so it cannot veto a found boundary", async () => {
    // Regression guard. The first version of this rule gated on "~1,000 characters
    // of body prose", which a model cannot estimate from a page image. In a live run
    // over a 25-page novel it rejected every single boundary it had itself identified
    // — including a mid-page subheading — with "the page is not long enough".
    const prompt = await render("page_sectioning", sectioningContext("dynamic"))

    expect(prompt).toContain("THREE OR MORE body paragraphs")
    expect(prompt).toContain("Do not judge length by character count")
    expect(prompt).toContain(
      "A normal full page of a novel or of a textbook chapter MEETS this floor",
    )
    expect(prompt).toContain(
      "Do NOT veto a boundary you have already identified on the grounds that the page is not long enough",
    )
    expect(prompt).toContain('"Not long enough" is NOT an acceptable reason')
    expect(prompt).not.toContain("1,000 characters")
  })

  it("dynamic mode still refuses the non-boundaries the model already judged correctly", async () => {
    const prompt = await render("page_sectioning", sectioningContext("dynamic"))

    expect(prompt).toContain("These are NOT boundaries")
    expect(prompt).toContain("alternating dialogue turns inside a single conversation")
    expect(prompt).toContain(
      "narration giving way to dialogue, or back, within the same scene",
    )
    expect(prompt).toContain("an ordinary paragraph break")
  })

  it("dynamic mode no longer forbids splitting activity-free pages", async () => {
    const prompt = await render("page_sectioning", sectioningContext("dynamic"))

    expect(prompt).not.toContain("A page with no activities — always one section")
    expect(prompt).toContain("A page with no activities, unless rule 3 above applies")
    expect(prompt).not.toContain(
      "Separation by visual whitespace, headings, or topic alone — not a reason to split",
    )
  })

  it("dynamic mode keeps the existing activity split rules", async () => {
    const prompt = await render("page_sectioning", sectioningContext("dynamic"))

    expect(prompt).toContain("MIXED MECHANICS")
    expect(prompt).toContain("NEW INSTRUCTION BLOCK")
    expect(prompt).toContain("A page with a SINGLE MECHANIC")
    expect(prompt).not.toContain("Do NOT split the page under any circumstance")
  })

  it("page mode keeps the whole page as one section and omits the narrative rule", async () => {
    const prompt = await render("page_sectioning", sectioningContext("page"))

    expect(prompt).toContain("The entire page is always ONE section")
    expect(prompt).toContain("Do NOT split the page under any circumstance")
    expect(prompt).not.toContain("READING PAGE THAT CROSSES A BOUNDARY")
    expect(prompt).not.toContain("MIXED MECHANICS")
  })
})

describe("page_sectioning_refinement mode branches", () => {
  it("dynamic mode mirrors the main prompt's split rules", async () => {
    const prompt = await render(
      "page_sectioning_refinement",
      refinementContext("dynamic"),
    )

    expect(prompt).toContain("the DEFAULT is ONE section for the whole page")
    expect(prompt).toContain("three or more body paragraphs")
    expect(prompt).toContain(
      "A single mechanic with many questions/items stays ONE section",
    )
    expect(prompt).toContain("at most 3 sections")
  })

  it("no longer tells the reviewer to put every question in its own section", async () => {
    for (const mode of ["page", "dynamic"] as const) {
      const prompt = await render(
        "page_sectioning_refinement",
        refinementContext(mode),
      )
      expect(prompt).not.toContain("each in their own section")
    }
  })

  it("page mode still treats any split as an error", async () => {
    const prompt = await render(
      "page_sectioning_refinement",
      refinementContext("page"),
    )

    expect(prompt).toContain("Under `page` mode there is exactly ONE section")
    expect(prompt).toContain("Any split is an error")
    expect(prompt).not.toContain("three or more body paragraphs")
  })
})
