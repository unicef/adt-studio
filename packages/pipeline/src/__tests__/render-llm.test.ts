import { describe, expect, it } from "vitest"
import type { GenerateObjectResult, LLMModel } from "@adt/llm"
import {
  collectOptionalTextIds,
  minimumLearnerResponseCount,
  renderSectionLlm,
} from "../render-llm.js"
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

  it("marks enumeration-marker label leaves as optional, but not real labels", () => {
    const optional = collectOptionalTextIds([
      { text_id: "m1", text_type: "label", text: "1." },
      { text_id: "m2", text_type: "label", text: "10." },
      { text_id: "m3", text_type: "label", text: "(i)" },
      { text_id: "m4", text_type: "label", text: "(vii)" },
      { text_id: "m5", text_type: "label", text: "(a)" },
      // Real content labels and non-label roles stay required.
      { text_id: "r1", text_type: "label", text: "Sehemu A" },
      { text_id: "r2", text_type: "text", text: "1." },
    ])
    expect(optional.has("m1")).toBe(true)
    expect(optional.has("m2")).toBe(true)
    expect(optional.has("m3")).toBe(true)
    expect(optional.has("m4")).toBe(true)
    expect(optional.has("m5")).toBe(true)
    expect(optional.has("r1")).toBe(false)
    expect(optional.has("r2")).toBe(false)
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

describe("minimumLearnerResponseCount", () => {
  it("does not double-count a question and its response blank", () => {
    expect(minimumLearnerResponseCount([
      {
        node_id: "activity",
        structure: "activity",
        children: [
          { node_id: "q1", role: "activity_question", text: "Name the animal." },
          { node_id: "b1", role: "activity_fill_in_the_blank", text: "___" },
        ],
      },
    ])).toBe(1)
  })

  it("requires one response for non-English activity instructions", () => {
    expect(minimumLearnerResponseCount([
      { node_id: "i1", role: "activity_instruction", text: "Completa las frases." },
      { node_id: "i2", role: "activity_instruction", text: "Usa el banco de palabras." },
    ])).toBe(1)
  })

  it("uses the larger of question and blank counts", () => {
    expect(minimumLearnerResponseCount([
      { node_id: "q1", role: "activity_question", text: "First?" },
      { node_id: "q2", role: "activity_question", text: "Second?" },
      { node_id: "b1", role: "activity_fill_in_the_blank", text: "___" },
    ])).toBe(2)
  })
})

describe("renderSectionLlm visual review routing", () => {
  const RENDERED_HTML =
    '<section role="region" data-section-type="text_only" data-section-id="s1"><p data-id="t1">Hello</p></section>'

  /** Records which prompt the review loop rendered and with what context. */
  function makeReviewModel(): {
    model: LLMModel
    calls: Array<{ promptName: string; context: Record<string, unknown> }>
  } {
    const calls: Array<{ promptName: string; context: Record<string, unknown> }> = []
    const model: LLMModel = {
      renderPrompt: async (promptName, context) => {
        calls.push({ promptName, context })
        return [{ role: "system", content: "You are a reviewer." }]
      },
      // Approve immediately — this test is about prompt selection, not revisions.
      generateObject: async <T>() =>
        ({
          object: { approved: true, reasoning: "looks good", content: "" } as T,
        }) as GenerateObjectResult<T>,
    }
    return { model, calls }
  }

  const renderModel: LLMModel = {
    renderPrompt: async () => [{ role: "system", content: "You are a renderer." }],
    generateObject: async <T>() =>
      ({
        object: { reasoning: "rendered", content: RENDERED_HTML } as T,
      }) as GenerateObjectResult<T>,
  }

  function makeInput(userPrompt?: string): RenderSectionInput {
    return {
      label: "book",
      pageId: "pg001",
      pageImageBase64: "cGFnZQ==",
      sectionIndex: 0,
      section: {
        sectionId: "s1",
        sectionType: "text_only",
        backgroundColor: "#fff",
        textColor: "#000",
        pageNumber: 1,
        isPruned: false,
        nodes: [],
      },
      context: {
        nodes: [{ node_id: "t1", role: "paragraph", text: "Hello" }],
        leaf_texts: [{ text_id: "t1", text_type: "paragraph", text: "Hello" }],
        image_refs: [],
        group_ids: [],
      },
      ...(userPrompt !== undefined && { userPrompt }),
    }
  }

  const config: RenderConfig = {
    renderType: "llm",
    promptName: "web_generation_html",
    modelId: "openai:gpt-5.4",
    maxRetries: 1,
    timeoutMs: 1000,
    temperature: 0.2,
    answerPromptName: "",
    templateName: "",
    visualRefinement: {
      enabled: true,
      promptName: "visual_review",
      maxIterations: 1,
      timeoutMs: 1000,
      temperature: 0.2,
    },
  }

  function makeDeps(reviewModel: LLMModel) {
    return {
      screenshotRenderer: {
        screenshot: async () => "aGVsbG8=",
        close: async () => {},
      },
      webAssetsDir: "/tmp/nonexistent",
      llmModel: reviewModel,
    }
  }

  it("uses the flexible reviewer and forwards instructions on a user-directed re-render", async () => {
    const { model, calls } = makeReviewModel()
    await renderSectionLlm(
      makeInput("Use a yellow background and red text."),
      config,
      renderModel,
      makeDeps(model),
    )

    expect(calls).toHaveLength(1)
    expect(calls[0].promptName).toBe("visual_review_flexible")
    expect(calls[0].context.user_instructions).toBe("Use a yellow background and red text.")
  })

  it("preserves a custom reviewer when instructions are provided", async () => {
    const { model, calls } = makeReviewModel()
    const customConfig: RenderConfig = {
      ...config,
      visualRefinement: {
        ...config.visualRefinement!,
        promptName: "custom_visual_review",
      },
    }

    await renderSectionLlm(
      makeInput("Use a yellow background and red text."),
      customConfig,
      renderModel,
      makeDeps(model),
    )

    expect(calls).toHaveLength(1)
    expect(calls[0].promptName).toBe("custom_visual_review")
    expect(calls[0].context.user_instructions).toBe("Use a yellow background and red text.")
  })

  it("keeps the configured reviewer when there is no user prompt", async () => {
    const { model, calls } = makeReviewModel()
    await renderSectionLlm(makeInput(), config, renderModel, makeDeps(model))

    expect(calls).toHaveLength(1)
    expect(calls[0].promptName).toBe("visual_review")
    expect(calls[0].context.user_instructions).toBe("")
  })

  it("treats a whitespace-only prompt as no instructions", async () => {
    const { model, calls } = makeReviewModel()
    await renderSectionLlm(makeInput("   \n  "), config, renderModel, makeDeps(model))

    expect(calls).toHaveLength(1)
    expect(calls[0].promptName).toBe("visual_review")
    expect(calls[0].context.user_instructions).toBe("")
  })
})
