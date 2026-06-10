import { describe, expect, it } from "vitest"
import type { LLMModel, GenerateObjectOptions, GenerateObjectResult, ValidationResult } from "@adt/llm"
import { collectHeadingTextIds, collectOptionalTextIds, renderSectionLlm } from "../render-llm.js"
import type { RenderConfig, RenderSectionInput } from "../web-rendering.js"

describe("collectOptionalTextIds", () => {
  it("marks single-underscore blank-cell leaves as optional (crossword cells)", () => {
    const optional = collectOptionalTextIds([
      { text_id: "n1", text_type: "activity_fill_in_the_blank", text: "_" },
      { text_id: "n2", text_type: "activity_fill_in_the_blank", text: "__" },
      { text_id: "n3", text_type: "activity_fill_in_the_blank", text: "___" },
    ])
    expect(optional.has("n1")).toBe(true)
    expect(optional.has("n2")).toBe(true)
    expect(optional.has("n3")).toBe(true)
  })

  it("marks visible letters as required (not optional)", () => {
    const optional = collectOptionalTextIds([
      { text_id: "n1", text_type: "activity_fill_in_the_blank", text: "R" },
      { text_id: "n2", text_type: "activity_fill_in_the_blank", text: "E" },
    ])
    expect(optional.has("n1")).toBe(false)
    expect(optional.has("n2")).toBe(false)
  })

  it("marks footer/header/page_number roles as optional", () => {
    const optional = collectOptionalTextIds([
      { text_id: "f1", text_type: "footer", text: "Some footer text" },
      { text_id: "h1", text_type: "header", text: "Header" },
      { text_id: "p1", text_type: "page_number", text: "42" },
    ])
    expect(optional.has("f1")).toBe(true)
    expect(optional.has("h1")).toBe(true)
    expect(optional.has("p1")).toBe(true)
  })

  it("marks placeholder-only text with underscores and separators as optional", () => {
    const optional = collectOptionalTextIds([
      { text_id: "n1", text_type: "activity_fill_in_the_blank", text: "_ _ _" },
      { text_id: "n2", text_type: "activity_fill_in_the_blank", text: "___/___/___" },
      { text_id: "n3", text_type: "activity_fill_in_the_blank", text: "..." },
    ])
    expect(optional.has("n1")).toBe(true)
    expect(optional.has("n2")).toBe(true)
    expect(optional.has("n3")).toBe(true)
  })

  it("does not mark mixed text-with-blank leaves as optional", () => {
    const optional = collectOptionalTextIds([
      { text_id: "n1", text_type: "activity_fill_in_the_blank", text: "Nombre: ___" },
      { text_id: "n2", text_type: "activity_fill_in_the_blank", text: "El Sol es una ___" },
    ])
    expect(optional.has("n1")).toBe(false)
    expect(optional.has("n2")).toBe(false)
  })

  it("does not match a single dot (normal punctuation)", () => {
    const optional = collectOptionalTextIds([
      { text_id: "n1", text_type: "text", text: "." },
    ])
    expect(optional.has("n1")).toBe(false)
  })

  it("matches a stateful regex consistently across repeated calls", () => {
    const leaves = [
      { text_id: "n1", text_type: "activity_fill_in_the_blank", text: "_" },
    ]
    expect(collectOptionalTextIds(leaves).has("n1")).toBe(true)
    expect(collectOptionalTextIds(leaves).has("n1")).toBe(true)
    expect(collectOptionalTextIds(leaves).has("n1")).toBe(true)
  })
})

describe("collectHeadingTextIds", () => {
  it("collects ids of leaves with role heading", () => {
    const ids = collectHeadingTextIds([
      { text_id: "n1", text_type: "heading", text: "Chapter 1" },
      { text_id: "n2", text_type: "text", text: "Body" },
      { text_id: "n3", text_type: "heading", text: "Subtitle" },
    ])
    expect(ids).toEqual(new Set(["n1", "n3"]))
  })

  it("returns an empty set when no heading leaves exist", () => {
    const ids = collectHeadingTextIds([
      { text_id: "n1", text_type: "text", text: "Body" },
    ])
    expect(ids.size).toBe(0)
  })
})

describe("renderSectionLlm — heading semantics enforcement", () => {
  const sectionInput: RenderSectionInput = {
    label: "test-book",
    pageId: "pg001",
    pageImageBase64: "base64img",
    sectionIndex: 0,
    section: {
      sectionId: "pg001_sec001",
      sectionType: "text_only",
      nodes: [],
      backgroundColor: "#ffffff",
      textColor: "#000000",
      pageNumber: 1,
      isPruned: false,
    },
    context: {
      nodes: [
        { node_id: "pg001_n0001", role: "heading", text: "Chapter 1" },
        { node_id: "pg001_n0002", role: "text", text: "Body text" },
      ],
      leaf_texts: [
        { text_id: "pg001_n0001", text_type: "heading", text: "Chapter 1" },
        { text_id: "pg001_n0002", text_type: "text", text: "Body text" },
      ],
      image_refs: [],
      group_ids: [],
    },
  }

  const config: RenderConfig = {
    renderType: "llm",
    promptName: "web_generation_html",
    modelId: "test-model",
    maxRetries: 1,
    timeoutMs: 1000,
    temperature: 0,
    answerPromptName: "",
    templateName: "",
  }

  const sectionHtml = (headingMarkup: string) =>
    `<div id="content" class="container"><section data-section-type="text_only" data-section-id="pg001_sec001">${headingMarkup}<p data-id="pg001_n0002">Body text</p></section></div>`

  async function validateThrough(headingMarkup: string): Promise<ValidationResult> {
    let captured: ValidationResult | undefined
    const fakeLlm: LLMModel = {
      generateObject: async <T>(opts: GenerateObjectOptions) => {
        const object = { reasoning: "test", content: sectionHtml(headingMarkup) }
        captured = opts.validate!(object, opts.context!)
        const cleaned = (captured.valid && captured.cleaned ? captured.cleaned : object) as T
        return { object: cleaned } as GenerateObjectResult<T>
      },
    }
    await renderSectionLlm(sectionInput, config, fakeLlm)
    return captured!
  }

  it("rejects a heading leaf rendered as a styled div", async () => {
    const result = await validateThrough(
      '<div class="text-2xl font-bold" data-id="pg001_n0001">Chapter 1</div>'
    )
    expect(result.valid).toBe(false)
    expect(result.errors).toContainEqual(
      expect.stringContaining('data-id "pg001_n0001" is a heading but is rendered as <div>')
    )
  })

  it("accepts a heading leaf rendered as <h2>", async () => {
    const result = await validateThrough(
      '<h2 class="text-2xl font-bold" data-id="pg001_n0001">Chapter 1</h2>'
    )
    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
  })
})
