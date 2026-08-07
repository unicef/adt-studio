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

const HTML_RENDER_PROMPTS = [
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
] as const

const FONT_SIZE_UTILITY_RE = /^(?:[a-z-]+:)*!?text-(?:xs|sm|base|lg|xl|[2-9]xl|\[)/

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

  it("maps semantic heading roles to one book-wide type scale", async () => {
    const messages = await promptEngine.renderPrompt("web_generation_html", {
      ...generationContext(),
      typography: [
        { className: "adt-h1", label: "Chapter title", mobilePx: 30, desktopPx: 48 },
        { className: "adt-h2", label: "Section heading", mobilePx: 24, desktopPx: 36 },
        { className: "adt-h3", label: "Subheading", mobilePx: 20, desktopPx: 28 },
      ],
    })
    const prompt = messages.map(messageText).join("\n")

    expect(prompt).toContain("A supplied `heading_level=N` is authoritative")
    expect(prompt).toContain('`chapter_title` as `<h1 class="adt-h1">`')
    expect(prompt).toContain('`section_heading` as `<h2 class="adt-h2">`')
    expect(prompt).toContain('`subheading` as `<h3 class="adt-h3">`')
  })

  for (const promptName of HTML_RENDER_PROMPTS) {
    it(`${promptName} receives consistent book-wide heading rules`, async () => {
      const messages = await promptEngine.renderPrompt(
        promptName,
        generationContext(),
      )
      const prompt = messages.map(messageText).join("\n")

      expect(prompt).toContain("## BOOK-WIDE HEADING HIERARCHY")
      expect(prompt).toContain('chapter_title` as `<h1 class="adt-h1">')
      expect(prompt).toContain("Never apply `text-*` or inline `font`/`font-size` overrides to a heading")

      const headingExamples = [...prompt.matchAll(/<h([1-6])\b[^>]*class="([^"]*)"/g)]
      expect(headingExamples.map((match) => match[1])).toEqual(["1", "2", "3"])
      for (const match of headingExamples) {
        const [, level, classNames] = match
        const classes = classNames.split(/\s+/)
        expect(classes, match[0]).toContain(`adt-h${level}`)
        expect(classes.some((className) => FONT_SIZE_UTILITY_RE.test(className)), match[0]).toBe(false)
      }

      expect(prompt).not.toMatch(
        /(?:heading|title)[^\n]*\b(?:[a-z-]+:)*!?text-(?:xs|sm|base|lg|xl|[2-9]xl|\[)/i,
      )
    })
  }

  it("requires AI edits to preserve retained heading semantics", async () => {
    const messages = await promptEngine.renderPrompt("html_edit", {
      instruction: "Change the background color",
      current_html: `<section><h2 class="adt-h2" data-id="title">Title</h2></section>`,
      screenshots: [],
      previous_attempt_failure: "",
    })
    const prompt = messages.map(messageText).join("\n")

    expect(prompt).toContain("must keep the same native `<h1>` through `<h6>` tag")
    expect(prompt).toContain("already uses the matching `adt-h1` through `adt-h6` class")
    expect(prompt).toContain("Do not migrate or otherwise rewrite that legacy typography")
    expect(prompt).toContain("must make the hierarchy change in Sectioning")
    expect(prompt).toContain("Intentional removal of the entire heading remains allowed")
  })

  it("keeps styleguide and visual-review prompts subordinate to outline typography", async () => {
    const [styleguideMessages, reviewMessages, flexibleMessages] = await Promise.all([
      promptEngine.renderPrompt("styleguide_generation", {
        page_images: [],
        book_fonts: [],
        typography: [{ className: "adt-h4", label: "Heading level 4", mobilePx: 19, desktopPx: 28 }],
      }),
      promptEngine.renderPrompt("visual_review", {
        nodes,
        section_type: "text_only",
        has_merged_content: false,
        viewports: [{ label: "Desktop", width: 1280, tailwind_prefix: "" }],
      }),
      promptEngine.renderPrompt("visual_review_flexible", {
        nodes,
        section_type: "text_only",
        has_merged_content: false,
        user_instructions: "Change the background",
        viewports: [{ label: "Desktop", width: 1280, tailwind_prefix: "" }],
      }),
    ])
    const styleguidePrompt = styleguideMessages.map(messageText).join("\n")
    const reviewPrompt = reviewMessages.map(messageText).join("\n")
    const flexiblePrompt = flexibleMessages.map(messageText).join("\n")

    expect(styleguidePrompt).toContain("do not assign every activity title to H2")
    expect(styleguidePrompt).toContain("selected later from the authoritative outline")
    expect(reviewPrompt).toContain("`adt-h1` through `adt-h6`")
    expect(flexiblePrompt).toContain("existing semantic `adt-*` type-scale classes and heading ranks remain fixed")
    expect(flexiblePrompt).toContain("Never add a `text-*` size utility")
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
