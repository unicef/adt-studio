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
    layout_type: "textbook",
    textbook_geometry_plan: {
      reasoning: "Focused inspection",
      images: [],
    },
  }
}

describe("web rendering reading-order prompts", () => {
  for (const promptName of [
    "web_generation_html",
    "web_generation_html_overlay",
    "web_generation_textbook_html_overlay",
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

  it("keeps storybook spreads together without loading textbook image policy", async () => {
    const messages = await promptEngine.renderPrompt(
      "web_generation_storybook_html",
      generationContext(),
    )
    const prompt = messages.map(messageText).join("\n")

    expect(prompt).toContain("continuous two-page compositions")
    expect(prompt).toContain("grid grid-cols-2 gap-0")
    expect(prompt).toContain("do NOT use `max-lg:grid-cols-1`")
    expect(prompt).toContain("Only at mobile width may the halves stack")
    expect(prompt).toContain("fit by HEIGHT")
    expect(prompt).not.toContain("TEXTBOOK IMAGE TRIAGE")
  })

  it("does not leak textbook image rules into non-textbook built-in prompts", async () => {
    for (const promptName of [
      "web_generation_html",
      "activity_open_ended_answer",
      "activity_underline_text",
      "visual_review",
      "visual_review_flexible",
    ]) {
      const messages = await promptEngine.renderPrompt(promptName, {
        ...generationContext(),
        layout_type: "reference",
        label: "reference-book",
        current_html: "<section></section>",
        has_merged_content: false,
      })
      const prompt = messages.map(messageText).join("\n")

      expect(prompt).not.toContain("TEXTBOOK IMAGE TRIAGE")
      expect(prompt).not.toContain("TEXTBOOK IMAGE-INTEGRITY REVIEW")
      expect(prompt).not.toContain("MANDATORY PRE-APPROVAL TEXTBOOK AUDIT")
    }
  })

  it("reviews storybooks as complete editorial spreads", async () => {
    const messages = await promptEngine.renderPrompt("visual_review_storybook", {
      ...generationContext(),
      label: "demo-book",
      current_html: "<section></section>",
      has_merged_content: false,
      user_instructions: "Keep the spread continuous.",
    })
    const prompt = messages.map(messageText).join("\n")

    expect(prompt).toContain("complete editorial composition")
    expect(prompt).toContain("Desktop and tablet must preserve genuine facing pages")
    expect(prompt).toContain("Keep the spread continuous.")
    expect(prompt).toContain("geometry_updates: []")
    expect(prompt).not.toContain("TEXTBOOK IMAGE-INTEGRITY REVIEW")
  })

  it("keeps partial storybook spread art during meaningfulness review", async () => {
    const messages = await promptEngine.renderPrompt(
      "image_meaningfulness_storybook",
      {
        page_image_base64: "page-image",
        images: [{
          imageId: "left-half",
          imageBase64: "candidate-image",
          width: 1200,
          height: 1600,
        }],
      },
    )
    const prompt = messages.map(messageText).join("\n")

    expect(prompt).toContain("STORYBOOK SPREAD OVERRIDE")
    expect(prompt).toContain("mostly background")
    expect(prompt).toContain("partial narrative fragment")
    expect(prompt).not.toContain("meaningful educational content")
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

  for (const promptName of [
    "web_generation_html",
    "web_generation_html_overlay",
    "activity_fill_in_a_table",
    "activity_fill_in_the_blank",
    "activity_matching",
    "activity_multi_select",
    "activity_multiple_choice",
    "activity_open_ended_answer",
    "activity_ordering",
    "activity_sorting",
    "activity_true_false",
    "activity_underline_text",
  ]) {
    it(`${promptName} triages textbook images before rendering`, async () => {
      const messages = await promptEngine.renderPrompt(promptName, {
        ...generationContext(),
        section_type: "activity_open_ended_answer",
        images: [{
          image_id: "pg006_im001",
          image_base64: "candidate-image",
          width: 1210,
          height: 1624,
        }],
      })
      const prompt = messages.map(messageText).join("\n")

      expect(prompt).toContain("TEXTBOOK IMAGE TRIAGE")
      expect(prompt).toContain("NEVER render a page replica **as a whole page**")
      expect(prompt).toContain("NEVER use a worksheet/form composite")
      expect(prompt).toContain("Image omission is valid")
      expect(prompt).toContain('data-textbook-crop="true"')
      expect(prompt).toContain("Do not leave a blank image-sized panel")
      expect(prompt).toContain("includes baked-in `a)`, `b)`, `c)` labels")
      expect(prompt).toContain("the semantic text still makes sense")
      expect(prompt).toContain("record the chosen crop rectangle")
      expect(prompt).toContain("no-glyph safety margin")
      expect(prompt).toContain("Treat text leaves inside the same `image_group`")
      expect(prompt).toContain("put the native `<input>`/`textarea` over that exact writable area")
      expect(prompt).toContain("perform a four-edge crop audit")
      expect(prompt).toContain("record the printed writable area's approximate native-image")
      expect(prompt).toContain("Count every visually separate printed writable region")
      expect(prompt).toContain("Never put `min-h-*`")
      expect(prompt).toContain("Do not force more than four tokens")
    })
  }

  it("gives the overlay renderer dimensions and an invariant image canvas", async () => {
    const messages = await promptEngine.renderPrompt("web_generation_textbook_html_overlay", {
      ...generationContext(),
      images: [{
        image_id: "pg006_im001",
        image_base64: "candidate-image",
        width: 1210,
        height: 1624,
      }],
    })
    const prompt = messages.map(messageText).join("\n")

    expect(prompt).toContain("pg006_im001 (1210×1624px)")
    expect(prompt).toContain("One exact coordinate canvas")
    expect(prompt).toContain("exact supplied `aspect-ratio`")
    expect(prompt).toContain("never automatically a background")
  })

  it("renders the focused textbook geometry plan as an authoritative contract", async () => {
    const messages = await promptEngine.renderPrompt("web_generation_html", {
      ...generationContext(),
      textbook_geometry_plan: {
        reasoning: "Focused inspection",
        images: [{
          image_id: "pg006_im001",
          role: "page_replica",
          keep_visible: true,
          crop: { x: 10, y: 20, width: 300, height: 120 },
          baked_text_ids: ["pg006_n0001"],
          writable_regions: [{ purpose: "date blank", x: 100, y: 70, width: 80, height: 20 }],
          reasoning: "Safe figure crop",
        }],
      },
    })
    const prompt = messages.map(messageText).join("\n")

    expect(prompt).toContain("FOCUSED TEXTBOOK GEOMETRY PLAN")
    expect(prompt).toContain("crop `(x=10, y=20, width=300, height=120)`")
    expect(prompt).toContain("baked text IDs: pg006_n0001")
    expect(prompt).toContain("`date blank`: `(x=100, y=70, width=80, height=20)`")
    expect(prompt).toContain("HTML validation will decode your CSS")
  })

  it("audits draft geometry for semantic banks and clipped intrinsic content", async () => {
    const images = [{
      image_id: "figure",
      image_base64: "candidate-image",
      width: 700,
      height: 535,
    }]
    const messages = await promptEngine.renderPrompt("textbook_geometry_review", {
      page_image_base64: "page-image",
      section_type: "activity_fill_in_the_blank",
      nodes,
      images,
      draft_plan: {
        reasoning: "Draft",
        images: [{
          image_id: "figure",
          role: "worksheet_form_composite",
          keep_visible: true,
          crop: { x: 31, y: 74, width: 618, height: 415 },
          baked_text_ids: ["sense_heading"],
          text_regions: [],
          writable_regions: [],
          reasoning: "Draft crop",
        }],
      },
    })
    const prompt = messages.map(messageText).join("\n")

    expect(prompt).toContain("Semantic-bank admission")
    expect(prompt).toContain("Complete essential-object bounds")
    expect(prompt).toContain("through an intrinsic heading")
    expect(prompt).toContain("leave the marker in the raster")
    expect(prompt).toContain("crop=(x=31, y=74, width=618, height=415)")
  })

  for (const promptName of ["visual_review", "visual_review_flexible", "visual_review_edit"]) {
    it(`${promptName} may remove proven duplicate textbook rasters`, async () => {
      const messages = await promptEngine.renderPrompt(promptName, {
        ...generationContext(),
        current_html: "<section></section>",
        has_merged_content: false,
        instruction: "Use a blue border.",
      })
      const prompt = messages.map(messageText).join("\n")

      expect(prompt).toContain("TEXTBOOK IMAGE-INTEGRITY REVIEW")
      expect(prompt).toContain("page replica")
      expect(prompt).toContain("worksheet/form composite")
      expect(prompt).toContain("MAY remove an `<img>`")
      expect(prompt).toContain("current HTML is the authority for image admission")
      expect(prompt).toContain("MUST NEVER add one")
      expect(prompt).toContain("data-textbook-crop")
      expect(prompt).toMatch(/blank image-(?:sized )?(?:panel|placeholder)/)
      expect(prompt).toContain("crop membership and its stable coordinate system are immutable during review")
      expect(prompt).toContain("recompute the wrapper `aspect-[W/H]`")
      expect(prompt).toContain("`sr-only` transcription decisions are monotonic")
      expect(prompt).toContain("clipped fragment")
      expect(prompt).toContain("semantic control must overlay that exact writable area")
      expect(prompt).toContain("MANDATORY PRE-APPROVAL TEXTBOOK AUDIT")
      expect(prompt).toContain("Crop-edge audit")
      expect(prompt).toContain("Raster/HTML duplicate audit")
      expect(prompt).toContain("Writable-area audit")
      expect(prompt).toContain("fixed one-row grid whose values overlap")
      expect(prompt).toContain("TEXTBOOK GEOMETRY MANIFEST")
      expect(prompt).toContain("remove any `min-h-*`")
      expect(prompt).toContain("geometry_updates")
      expect(prompt).toContain("transcription_updates")
      expect(prompt).not.toContain("Preserve ALL image tags")
    })
  }
})
