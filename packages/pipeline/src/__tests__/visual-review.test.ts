import { describe, expect, it } from "vitest"
import type { GenerateObjectResult, LLMModel } from "@adt/llm"
import type { TextbookGeometryPlan } from "@adt/types"
import {
  anchoredOverlayGeometryErrors,
  runVisualReviewLoop,
  srOnlyPreservationErrors,
  textbookGeometryManifest,
  textbookCropMutationErrors,
} from "../visual-review.js"

describe("runVisualReviewLoop", () => {
  it("decodes textbook crop and overlay geometry into native pixels", () => {
    const html = '<section><div data-textbook-crop="true" class="relative overflow-hidden aspect-[1000/200]"><img data-id="page" class="absolute max-w-none h-auto w-[120%] left-[-10%] top-[-150%]"></div><div class="relative aspect-[400/200]"><img data-id="figure" class="w-full h-auto"><input data-activity-item="item-1" class="absolute left-[25%] top-[50%] w-[20%] h-[10%]"></div></section>'
    const manifest = textbookGeometryManifest(html, new Map([
      ["page", { base64: "", width: 1200, height: 1600 }],
      ["figure", { base64: "", width: 400, height: 200 }],
    ]))

    expect(manifest).toContain("Crop page: source 1200x1600px")
    expect(manifest).toContain("x=100.0, y=300.0, width=1000.0, height=200.0")
    expect(manifest).toContain("Control item-1 on figure")
    expect(manifest).toContain("x=100.0, y=100.0, width=80.0, height=20.0")
  })

  it("rejects min-size overrides on percentage-positioned figure controls", () => {
    const html = '<section><div class="relative aspect-[400/200]"><img data-id="figure" class="w-full h-auto"><input data-activity-item="item-1" class="absolute left-[25%] top-[50%] w-[20%] h-[10%] min-h-11"></div></section>'
    expect(anchoredOverlayGeometryErrors(html)).toEqual([
      expect.stringContaining("no min/max dimension"),
    ])
  })

  it("reports a nested image overlay violation only once", () => {
    const html = '<section><div class="relative"><div class="relative aspect-[400/200]"><img data-id="figure" class="w-full h-auto"><input data-activity-item="item-1" class="absolute left-[25%] top-[50%] w-[20%] h-[10%] min-h-11"></div></div></section>'
    expect(anchoredOverlayGeometryErrors(html)).toHaveLength(1)
  })
  it("applies a validated revision and returns approved result", async () => {
    let call = 0
    const fakeModel: LLMModel = {
      renderPrompt: async () => [{ role: "system", content: "You are a reviewer." }],
      generateObject: async <T>() => {
        call++
        if (call === 1) {
          return {
            object: {
              approved: false,
              reasoning: "needs adjustment",
              content: '<section data-section-id="s1" class="ok">Updated</section>',
            } as T,
          } as GenerateObjectResult<T>
        }
        return {
          object: {
            approved: true,
            reasoning: "looks good",
            content: "",
          } as T,
        } as GenerateObjectResult<T>
      },
    }

    let screenshotCalls = 0
    const result = await runVisualReviewLoop({
      initialHtml: '<section data-section-id="s1">Initial</section>',
      label: "book",
      pageId: "pg001",
      images: new Map(),
      deps: {
        llmModel: fakeModel,
        screenshotRenderer: {
          screenshot: async () => {
            screenshotCalls++
            return "aGVsbG8="
          },
          close: async () => {},
        },
        webAssetsDir: "/tmp/nonexistent",
      },
      promptName: "visual_review",
      maxIterations: 2,
      timeoutMs: 1000,
      firstIterationScreenshotsText: "first set",
      nextIterationScreenshotsText: "next set",
      trailingContextText: "Section type: text_only",
      validateHtml: (html) => ({
        valid: html.includes('class="ok"'),
        errors: html.includes('class="ok"') ? [] : ["missing class=ok"],
      }),
    })

    expect(result.approved).toBe(true)
    expect(result.html).toContain('class="ok"')
    expect(screenshotCalls).toBe(6)
  })

  it("applies a structured visual-review crop refinement deterministically", async () => {
    let call = 0
    const fakeModel: LLMModel = {
      renderPrompt: async () => [{ role: "system", content: "You are a reviewer." }],
      generateObject: async <T>() => {
        call++
        return {
          object: call === 1
            ? {
                approved: false,
                reasoning: "The bottom edge includes adjacent prose.",
                content: "",
                geometry_updates: [{
                  image_id: "page",
                  crop: { x: 0, y: 0, width: 400, height: 350 },
                }],
              }
            : {
                approved: true,
                reasoning: "The crop is now clean.",
                content: "",
                geometry_updates: [],
              },
        } as GenerateObjectResult<T>
      },
    }
    const geometryPlan: TextbookGeometryPlan = {
      reasoning: "Keep the required diagram only.",
      images: [{
        image_id: "page",
        role: "page_replica",
        keep_visible: true,
        crop: { x: 0, y: 0, width: 400, height: 400 },
        baked_text_ids: [],
        text_regions: [],
        writable_regions: [],
        reasoning: "Initial crop.",
      }],
    }

    const result = await runVisualReviewLoop({
      initialHtml: '<section data-section-id="s1"><div data-textbook-crop="true" class="relative overflow-hidden aspect-[400/400] w-full"><img data-id="page" class="absolute max-w-none h-auto w-[100%] left-0 top-0"></div></section>',
      label: "book",
      pageId: "pg001",
      images: new Map([["page", { base64: "aGVsbG8=", width: 400, height: 500 }]]),
      deps: {
        llmModel: fakeModel,
        screenshotRenderer: {
          screenshot: async () => "aGVsbG8=",
          close: async () => {},
        },
        webAssetsDir: "/tmp/nonexistent",
      },
      promptName: "visual_review",
      maxIterations: 2,
      timeoutMs: 1000,
      firstIterationScreenshotsText: "first set",
      nextIterationScreenshotsText: "next set",
      trailingContextText: "Section type: text_only",
      textbookGeometryPlan: geometryPlan,
      validateHtml: () => ({ valid: true, errors: [] }),
    })

    expect(result.approved).toBe(true)
    expect(result.html).toContain("aspect-[400/350]")
    expect(result.html).not.toContain("aspect-[400/400]")
  })

  it("applies a structured baked-transcription update without rewriting DOM order", async () => {
    let call = 0
    const fakeModel: LLMModel = {
      renderPrompt: async () => [{ role: "system", content: "You are a reviewer." }],
      generateObject: async <T>() => {
        call++
        return {
          object: call === 1
            ? {
                approved: false,
                reasoning: "The raster and semantic c) are both visible.",
                content: "",
                geometry_updates: [],
                transcription_updates: [{ image_id: "figure", text_id: "option-c" }],
              }
            : {
                approved: true,
                reasoning: "Only the raster marker is visible now.",
                content: "",
                geometry_updates: [],
                transcription_updates: [],
              },
        } as GenerateObjectResult<T>
      },
    }
    const geometryPlan: TextbookGeometryPlan = {
      reasoning: "Keep the option figure.",
      images: [{
        image_id: "figure",
        role: "worksheet_form_composite",
        keep_visible: true,
        crop: { x: 0, y: 0, width: 400, height: 350 },
        baked_text_ids: [],
        text_regions: [{
          text_id: "option-c",
          legibility: "complete",
          x: 5,
          y: 5,
          width: 20,
          height: 20,
        }],
        writable_regions: [],
        reasoning: "Initial crop.",
      }],
    }

    const result = await runVisualReviewLoop({
      initialHtml: '<section data-section-id="s1"><div data-textbook-crop="true" class="relative overflow-hidden aspect-[400/350] w-full"><img data-id="figure" class="absolute max-w-none h-auto w-[100%] left-0 top-0"></div><span data-id="option-c">c)</span></section>',
      label: "book",
      pageId: "pg001",
      images: new Map([["figure", { base64: "aGVsbG8=", width: 400, height: 500 }]]),
      deps: {
        llmModel: fakeModel,
        screenshotRenderer: {
          screenshot: async () => "aGVsbG8=",
          close: async () => {},
        },
        webAssetsDir: "/tmp/nonexistent",
      },
      promptName: "visual_review",
      maxIterations: 2,
      timeoutMs: 1000,
      firstIterationScreenshotsText: "first set",
      nextIterationScreenshotsText: "next set",
      trailingContextText: "Section type: activity",
      textbookGeometryPlan: geometryPlan,
      validateHtml: () => ({ valid: true, errors: [] }),
    })

    expect(result.approved).toBe(true)
    expect(result.html).toContain('<span data-id="option-c" class="sr-only">c)</span>')
    expect(result.html.indexOf('data-id="figure"')).toBeLessThan(result.html.indexOf('data-id="option-c"'))
  })

  it("keeps current html when revision fails validation", async () => {
    let call = 0
    const fakeModel: LLMModel = {
      renderPrompt: async () => [{ role: "system", content: "You are a reviewer." }],
      generateObject: async <T>() => {
        call++
        if (call === 1) {
          return {
            object: {
              approved: false,
              reasoning: "bad structure",
              content: "<div>Not a section</div>",
            } as T,
          } as GenerateObjectResult<T>
        }
        return {
          object: {
            approved: true,
            reasoning: "done",
            content: "",
          } as T,
        } as GenerateObjectResult<T>
      },
    }

    const initialHtml = '<section data-section-id="s1">Initial</section>'
    const result = await runVisualReviewLoop({
      initialHtml,
      label: "book",
      pageId: "pg001",
      images: new Map(),
      deps: {
        llmModel: fakeModel,
        screenshotRenderer: {
          screenshot: async () => "aGVsbG8=",
          close: async () => {},
        },
        webAssetsDir: "/tmp/nonexistent",
      },
      promptName: "visual_review",
      maxIterations: 2,
      timeoutMs: 1000,
      firstIterationScreenshotsText: "first set",
      nextIterationScreenshotsText: "next set",
      trailingContextText: "Section type: text_only",
      validateHtml: (html) => ({
        valid: html.includes("<section"),
        errors: html.includes("<section") ? [] : ["missing <section>"],
      }),
    })

    expect(result.approved).toBe(true)
    expect(result.html).toBe(initialHtml)
  })

  it("rejects a reviewer revision that restores an image omitted by generation triage", async () => {
    let call = 0
    let validationFeedback = ""
    const fakeModel: LLMModel = {
      renderPrompt: async () => [{ role: "system", content: "You are a reviewer." }],
      generateObject: async <T>(opts) => {
        call++
        if (call === 1) {
          return {
            object: {
              approved: false,
              reasoning: "The source photo looks missing.",
              content:
                '<section data-section-id="s1"><img data-id="pg001_im001" src="/assets/pg001_im001.jpg">Initial</section>',
            } as T,
          } as GenerateObjectResult<T>
        }

        const messages = (opts.messages ?? []) as Array<{ role: string; content: unknown }>
        const user = messages.find((message) => message.role === "user")
        if (Array.isArray(user?.content)) {
          validationFeedback = user.content
            .filter((part): part is { type: "text"; text: string } =>
              typeof part === "object" && part !== null &&
              (part as { type?: unknown }).type === "text" &&
              typeof (part as { text?: unknown }).text === "string"
            )
            .map((part) => part.text)
            .join("\n")
        }
        return {
          object: {
            approved: true,
            reasoning: "The semantic adaptation is complete without the omitted raster.",
            content: "",
          } as T,
        } as GenerateObjectResult<T>
      },
    }

    const initialHtml = '<section data-section-id="s1">Initial</section>'
    const result = await runVisualReviewLoop({
      initialHtml,
      label: "book",
      pageId: "pg001",
      images: new Map(),
      deps: {
        llmModel: fakeModel,
        screenshotRenderer: {
          screenshot: async () => "aGVsbG8=",
          close: async () => {},
        },
        webAssetsDir: "/tmp/nonexistent",
      },
      promptName: "visual_review",
      maxIterations: 2,
      timeoutMs: 1000,
      firstIterationScreenshotsText: "first set",
      nextIterationScreenshotsText: "next set",
      trailingContextText: "Section type: text_and_single_image",
      textbookGeometryPlan: {
        reasoning: "The source raster was intentionally omitted during textbook triage.",
        images: [],
      },
      validateHtml: () => ({ valid: true, errors: [] }),
    })

    expect(result.approved).toBe(true)
    expect(result.html).toBe(initialHtml)
    expect(validationFeedback).toContain("cannot add or restore image data-id")
  })

  it("rejects a reviewer revision that mutates a retained textbook crop", async () => {
    let call = 0
    let validationFeedback = ""
    const fakeModel: LLMModel = {
      renderPrompt: async () => [{ role: "system", content: "You are a reviewer." }],
      generateObject: async <T>(opts) => {
        call++
        if (call === 1) {
          return {
            object: {
              approved: false,
              reasoning: "Make the image fill the crop.",
              content:
                '<section data-section-id="s1"><div data-textbook-crop="true" class="relative overflow-hidden aspect-[2/1]"><img data-id="pg001_im001" src="/api/image" class="absolute h-full w-full object-cover"></div></section>',
            } as T,
          } as GenerateObjectResult<T>
        }
        const messages = (opts.messages ?? []) as Array<{ role: string; content: unknown }>
        const user = messages.find((message) => message.role === "user")
        if (Array.isArray(user?.content)) {
          validationFeedback = user.content
            .filter((part): part is { type: "text"; text: string } =>
              typeof part === "object" && part !== null &&
              (part as { type?: unknown }).type === "text" &&
              typeof (part as { text?: unknown }).text === "string"
            )
            .map((part) => part.text)
            .join("\n")
        }
        return {
          object: { approved: true, reasoning: "Keep the calculated crop.", content: "" } as T,
        } as GenerateObjectResult<T>
      },
    }

    const initialHtml =
      '<section data-section-id="s1"><div data-textbook-crop="true" class="relative overflow-hidden aspect-[2/1]"><img data-id="pg001_im001" src="/api/image" class="absolute max-w-none h-auto w-[120%] left-[-10%] top-[-20%]"></div></section>'
    const result = await runVisualReviewLoop({
      initialHtml,
      label: "book",
      pageId: "pg001",
      images: new Map(),
      deps: {
        llmModel: fakeModel,
        screenshotRenderer: {
          screenshot: async () => "aGVsbG8=",
          close: async () => {},
        },
        webAssetsDir: "/tmp/nonexistent",
      },
      promptName: "visual_review",
      maxIterations: 2,
      timeoutMs: 1000,
      firstIterationScreenshotsText: "first set",
      nextIterationScreenshotsText: "next set",
      trailingContextText: "Section type: text_and_single_image",
      textbookGeometryPlan: {
        reasoning: "Preserve the deterministic crop selected for this textbook figure.",
        images: [{
          image_id: "pg001_im001",
          role: "page_replica",
          keep_visible: true,
          crop: { x: 100, y: 200, width: 1000, height: 500 },
          baked_text_ids: [],
          text_regions: [],
          writable_regions: [],
          reasoning: "The retained crop excludes the surrounding page.",
        }],
      },
      validateHtml: () => ({ valid: true, errors: [] }),
    })

    expect(result.approved).toBe(true)
    expect(result.html).toBe(initialHtml)
    expect(validationFeedback).toContain("unstable coordinate geometry")
  })

  it("accepts a stable percentage-based textbook crop refinement", () => {
    const current =
      '<section data-section-id="s1"><div data-textbook-crop="true" class="relative overflow-hidden aspect-[2/1]"><img data-id="pg001_im001" src="/api/image" class="absolute max-w-none h-auto w-[120%] left-[-10%] top-[-20%]"></div></section>'
    const revised =
      '<section data-section-id="s1"><div data-textbook-crop="true" class="relative overflow-hidden aspect-[3/1] rounded-lg"><img data-id="pg001_im001" src="/api/image" class="absolute max-w-none h-auto w-[130%] left-[-12%] top-[-25%]"></div></section>'

    expect(textbookCropMutationErrors(current, revised)).toEqual([])
  })

  it("rejects removal of an atomic textbook crop", () => {
    const current =
      '<section data-section-id="s1"><div data-textbook-crop="true" class="relative overflow-hidden aspect-[2/1]"><img data-id="pg001_im001" src="/api/image" class="absolute max-w-none h-auto w-[120%] left-[-10%] top-[-20%]"></div><span data-id="caption" class="sr-only">Label</span></section>'
    const revised =
      '<section data-section-id="s1"><span data-id="caption" class="sr-only">Label</span></section>'

    expect(textbookCropMutationErrors(current, revised)).toEqual([
      expect.stringContaining("cannot remove generated data-textbook-crop image"),
    ])
  })

  it("preserves existing sr-only baked-text transcriptions", () => {
    const current =
      '<section data-section-id="s1"><span data-id="label" class="sr-only">a)</span></section>'
    const revised =
      '<section data-section-id="s1"><span data-id="label" class="text-blue-700">a)</span></section>'

    expect(srOnlyPreservationErrors(current, revised)).toEqual([
      expect.stringContaining("cannot remove sr-only from transcription data-id"),
    ])
  })

  it("keeps original turn and latest two turns in conversation history", async () => {
    let call = 0
    const userHtmlSnippetsByCall: string[][] = []

    const fakeModel: LLMModel = {
      renderPrompt: async () => [{ role: "system", content: "You are a reviewer." }],
      generateObject: async <T>(opts) => {
        const messages = (opts.messages ?? []) as Array<{ role: string; content: unknown }>
        const userHtmlSnippets = messages
          .filter((m) => m.role === "user" && Array.isArray(m.content))
          .map((m) => {
            const parts = m.content as Array<{ type: string; text?: string }>
            const textPart = parts.find((p) => p.type === "text" && (p.text ?? "").includes("Current HTML"))
            return textPart?.text ?? ""
          })
        userHtmlSnippetsByCall.push(userHtmlSnippets)

        call++
        if (call < 4) {
          return {
            object: {
              approved: false,
              reasoning: "revise",
              content: `<section data-section-id="s1">v${call}</section>`,
            } as T,
          } as GenerateObjectResult<T>
        }

        return {
          object: {
            approved: true,
            reasoning: "done",
            content: "",
          } as T,
        } as GenerateObjectResult<T>
      },
    }

    const result = await runVisualReviewLoop({
      initialHtml: '<section data-section-id="s1">Initial</section>',
      label: "book",
      pageId: "pg001",
      images: new Map(),
      deps: {
        llmModel: fakeModel,
        screenshotRenderer: {
          screenshot: async () => "aGVsbG8=",
          close: async () => {},
        },
        webAssetsDir: "/tmp/nonexistent",
      },
      promptName: "visual_review",
      maxIterations: 4,
      timeoutMs: 1000,
      firstIterationScreenshotsText: "first set",
      nextIterationScreenshotsText: "next set",
      trailingContextText: "Section type: text_only",
      validateHtml: (html) => ({
        valid: html.includes("<section"),
        errors: html.includes("<section") ? [] : ["missing <section>"],
      }),
    })

    expect(result.approved).toBe(true)
    expect(result.html).toContain(">v3<")

    // The conversation window keeps only the most recent turn; the system prompt
    // is sent separately so prior screenshots/HTML aren't carried forward.
    const fourthCall = userHtmlSnippetsByCall[3]
    expect(fourthCall).toHaveLength(1)
    expect(fourthCall[0]).toContain("v3")
    expect(fourthCall[0]).not.toContain("Initial")
    expect(fourthCall[0]).not.toContain("v1")
    expect(fourthCall[0]).not.toContain("v2")
  })
})
