import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterAll, describe, expect, it } from "vitest"
import { createPromptEngine } from "@adt/llm"
import type { Message } from "@adt/llm"

/**
 * SPEC-0024: the writing-direction block reaches every prompt that writes or
 * reviews page HTML, and is inert for a book that is not right-to-left — the
 * rendered prompt (and so its cache key) must not change by a single byte.
 */
const promptsDir = path.join(process.cwd(), "prompts")
const INCLUDE = '{% include "_text_direction" -%}'
// The prompts that compare a rendering with the original page image also get
// the line that calls left-aligned text a defect.
const REVIEWING_INCLUDE = '{% include "_text_direction", reviewing: true -%}'
const INCLUDE_LINES = /\{% include "_text_direction"(?:, reviewing: true)? -%\}\r?\n/g
const HEADING = "## WRITING DIRECTION: RIGHT TO LEFT"
const DEFECT_LINE = "Text in the book's own script sitting against the left edge is a defect"
// The sectioning prompts save the order a page is read in: they get their own block.
const READING_INCLUDE_LINE = '{% include "_reading_direction" -%}\n'
const READING_HEADING = "## READING DIRECTION: RIGHT TO LEFT"
const SECTIONING_PROMPTS = ["page_sectioning", "page_sectioning_refinement"]

const RENDER_PROMPTS = [
  "web_generation_html",
  "web_generation_html_overlay",
  "activity_multiple_choice",
  "activity_multi_select",
  "activity_underline_text",
  "activity_true_false",
  "activity_fill_in_the_blank",
  "activity_fill_in_a_table",
  "activity_matching",
  "activity_sorting",
  "activity_ordering",
  "activity_open_ended_answer",
]
const VISUAL_REVIEW_PROMPTS = ["visual_review", "visual_review_flexible", "visual_review_edit"]
const EDIT_PROMPTS = ["html_edit", "html_edit_verify"]
const REVIEW_AND_EDIT_PROMPTS = [...VISUAL_REVIEW_PROMPTS, ...EDIT_PROMPTS]
const ALL_PROMPTS = [...RENDER_PROMPTS, ...REVIEW_AND_EDIT_PROMPTS]

const context: Record<string, unknown> = {
  page_image_base64: "page-image",
  source_pages: [],
  section_id: "pg006_sec001",
  section_type: "text_and_images",
  images: [],
  nodes: [{ node_id: "n1", role: "heading", text: "Title" }],
  leaf_texts: [],
  group_ids: [],
  styleguide: "",
  book_fonts: [],
  typography: [],
  viewports: [{ label: "Desktop", width: 1280, tailwind_prefix: "" }],
  user_instructions: "",
  has_merged_content: false,
  current_html: "<section></section>",
  instruction: "Make the heading blue",
  screenshots: [],
}

const sectioningContext: Record<string, unknown> = {
  page: { pageNumber: 4, text: "Page text", imageBase64: "page-image" },
  images: [],
  structure_types: [{ key: "table", description: "Table" }],
  role_types: [{ key: "text", description: "Body text" }],
  section_types: [{ key: "table_of_contents", description: "Contents" }],
  mode: "dynamic",
  book_outline: null,
  max_refinements: 1,
  iteration: 1,
  prior_notes: [],
  candidate: { reasoning: "ok", sections_json: "[]" },
}

/** The prompts as they were before the block existed: same files, include lines removed. */
const withoutBlockDir = fs.mkdtempSync(path.join(os.tmpdir(), "adt-prompts-no-direction-"))
for (const file of fs.readdirSync(promptsDir)) {
  if (file === "_text_direction.liquid" || file === "_reading_direction.liquid") continue
  const source = path.join(promptsDir, file)
  if (!fs.statSync(source).isFile()) continue
  fs.writeFileSync(
    path.join(withoutBlockDir, file),
    fs.readFileSync(source, "utf8").replace(INCLUDE_LINES, "").split(READING_INCLUDE_LINE).join(""),
  )
}
afterAll(() => fs.rmSync(withoutBlockDir, { recursive: true, force: true }))

const current = createPromptEngine(promptsDir)
const before = createPromptEngine(withoutBlockDir)

function text(messages: Message[]): string {
  return messages
    .map((message) =>
      typeof message.content === "string"
        ? message.content
        : message.content.filter((part) => part.type === "text").map((part) => part.text).join("\n"),
    )
    .join("\n<<next message>>\n")
}

describe("writing-direction prompt block (SPEC-0024)", () => {
  it("is wired into all seventeen prompts", () => {
    // The twelve render prompts get it through the shared fidelity partial.
    expect(fs.readFileSync(path.join(promptsDir, "_render_fidelity.liquid"), "utf8")).toContain(INCLUDE)
    for (const name of RENDER_PROMPTS) {
      expect(fs.readFileSync(path.join(promptsDir, `${name}.liquid`), "utf8"), name).toContain('{% include "_render_fidelity" %}')
    }
    for (const name of EDIT_PROMPTS) {
      expect(fs.readFileSync(path.join(promptsDir, `${name}.liquid`), "utf8"), name).toContain(INCLUDE)
    }
    for (const name of VISUAL_REVIEW_PROMPTS) {
      expect(fs.readFileSync(path.join(promptsDir, `${name}.liquid`), "utf8"), name).toContain(REVIEWING_INCLUDE)
    }
  })

  // The edit verifier is told to judge only whether the user's edit was
  // applied, and it sees before and after screenshots, never the original
  // page. Told that left-aligned text is a defect, it could fail a correct
  // edit on a page that already had such text, and trigger another edit pass.
  // The prompts that write or edit a page are not asked to judge it either.
  it("tells only the visual-review prompts that left-aligned text is a defect", async () => {
    for (const name of ALL_PROMPTS) {
      const rendered = await current.renderPrompt(name, { ...context, page_direction: "rtl" })
      const system = text(rendered.filter((message) => message.role === "system"))
      expect(system.includes(DEFECT_LINE), name).toBe(VISUAL_REVIEW_PROMPTS.includes(name))
    }
  })

  for (const name of ALL_PROMPTS) {
    it(`AC-1: ${name} renders unchanged for a book that is not right-to-left`, async () => {
      const original = await before.renderPrompt(name, context)
      for (const pageDirection of [undefined, "", "ltr"]) {
        const rendered = await current.renderPrompt(name, { ...context, page_direction: pageDirection })
        expect(rendered, `page_direction=${String(pageDirection)}`).toEqual(original)
      }
    })

    it(`AC-2: ${name} carries the block once, in the system message, for a right-to-left book`, async () => {
      const original = await before.renderPrompt(name, context)
      const rendered = await current.renderPrompt(name, { ...context, page_direction: "rtl" })
      const system = text(rendered.filter((message) => message.role === "system"))
      expect(system.split(HEADING)).toHaveLength(2)
      expect(system).toContain('Do NOT use `text-left` or `text-right`')
      // Nothing but the system message changes, and nothing is removed from it.
      expect(rendered.filter((message) => message.role !== "system")).toEqual(
        original.filter((message) => message.role !== "system"),
      )
      expect(system.length).toBeGreaterThan(text(original.filter((message) => message.role === "system")).length)
    })
  }
})


describe("reading-direction prompt block for sectioning (SPEC-0024)", () => {
  for (const name of SECTIONING_PROMPTS) {
    it(`AC-16: ${name} includes the block and renders unchanged for a book that is not right-to-left`, async () => {
      expect(fs.readFileSync(path.join(promptsDir, `${name}.liquid`), "utf8")).toContain(READING_INCLUDE_LINE)
      const original = await before.renderPrompt(name, sectioningContext)
      for (const pageDirection of [undefined, "", "ltr"]) {
        const rendered = await current.renderPrompt(name, { ...sectioningContext, page_direction: pageDirection })
        expect(rendered, `page_direction=${String(pageDirection)}`).toEqual(original)
      }
    })

    it(`AC-16: ${name} carries the block once, in the system message, for a right-to-left book`, async () => {
      const original = await before.renderPrompt(name, sectioningContext)
      const rendered = await current.renderPrompt(name, { ...sectioningContext, page_direction: "rtl" })
      const system = text(rendered.filter((message) => message.role === "system"))
      expect(system.split(READING_HEADING)).toHaveLength(2)
      expect(system).toContain("the first `table_cell` is the RIGHTMOST cell")
      // The page-HTML block is not for sectioning.
      expect(system).not.toContain(HEADING)
      expect(rendered.filter((message) => message.role !== "system")).toEqual(
        original.filter((message) => message.role !== "system"),
      )
      expect(system.length).toBeGreaterThan(text(original.filter((message) => message.role === "system")).length)
    })
  }
})
