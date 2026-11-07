import { afterEach, describe, expect, it, vi } from "vitest"
import type { GenerateObjectResult, LLMModel } from "@adt/llm"
import { DEFAULT_LLM_MODEL_ID } from "@adt/types"
import type { AppConfig } from "@adt/types"
import { resolveVisualReviewModelId, runVisualReviewLoop } from "../visual-review.js"

afterEach(() => {
  vi.restoreAllMocks()
})

describe("runVisualReviewLoop", () => {
  it.each([
    { name: "an unrepairable defect", revisions: [""], approved: false, expected: "Initial" },
    { name: "an unchanged revision", revisions: ['<section data-section-id="s1">Initial</section>  '], approved: false, expected: "Initial" },
    { name: "a revision cycle", revisions: ['<section data-section-id="s1">Revised</section>', '<section data-section-id="s1">Initial</section>'], approved: false, expected: "Revised" },
    { name: "approval with extraneous content", revisions: ['<section data-section-id="s1">Ignored</section>'], approved: true, expected: "Initial" },
  ])("stops on $name without extra calls or overwriting accepted HTML", async ({ revisions, approved, expected }) => {
    let call = 0
    const screenshot = vi.fn(async () => "aGVsbG8=")
    const fakeModel: LLMModel = {
      renderPrompt: async () => [{ role: "system", content: "You are a reviewer." }],
      generateObject: async <T>() => {
        if (call >= revisions.length) throw new Error("Unexpected extra review call")
        return { object: { approved, reasoning: "review decision", content: revisions[call++] } as T } as GenerateObjectResult<T>
      },
    }
    const result = await runVisualReviewLoop({
      initialHtml: '<section data-section-id="s1">Initial</section>',
      label: "book", pageId: "pg001", images: new Map(),
      deps: { llmModel: fakeModel, screenshotRenderer: { screenshot, close: async () => {} }, webAssetsDir: "/tmp/nonexistent" },
      promptName: "visual_review", maxIterations: 4, timeoutMs: 1000,
      firstIterationScreenshotsText: "first set", nextIterationScreenshotsText: "next set", trailingContextText: "Section type: text_only",
      validateHtml: () => ({ valid: true, errors: [] }),
    })
    expect(result).toEqual({ html: `<section data-section-id="s1">${expected}</section>`, approved })
    expect(call).toBe(revisions.length)
    expect(screenshot).toHaveBeenCalledTimes(3 * revisions.length)
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

  it("keeps only the current turn in conversation history", async () => {
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

  it("skips refinement instead of failing when screenshots cannot be rendered", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    let generateCalls = 0
    const fakeModel: LLMModel = {
      renderPrompt: async () => [{ role: "system", content: "You are a reviewer." }],
      generateObject: async <T>() => {
        generateCalls++
        return {
          object: { approved: true, reasoning: "unused", content: "" } as T,
        } as GenerateObjectResult<T>
      },
    }

    const initialHtml = '<section data-section-id="s1">Initial</section>'
    let screenshotCalls = 0
    const result = await runVisualReviewLoop({
      initialHtml,
      label: "book",
      pageId: "pg001",
      images: new Map(),
      deps: {
        llmModel: fakeModel,
        screenshotRenderer: {
          screenshot: async () => {
            screenshotCalls++
            throw new Error("page.screenshot: Timeout 30000ms exceeded.")
          },
          close: async () => {},
        },
        webAssetsDir: "/tmp/nonexistent",
      },
      promptName: "visual_review",
      maxIterations: 3,
      timeoutMs: 1000,
      firstIterationScreenshotsText: "first set",
      nextIterationScreenshotsText: "next set",
      trailingContextText: "Section type: text_only",
      validateHtml: () => ({ valid: true, errors: [] }),
    })

    // The page keeps its generated HTML — the failure is not propagated.
    expect(result.html).toBe(initialHtml)
    expect(result.approved).toBe(false)
    // No review call is made without screenshots, and the loop doesn't spin
    // through the remaining iterations.
    expect(generateCalls).toBe(0)
    expect(screenshotCalls).toBe(6) // 3 viewports × one retry
    expect(warn).toHaveBeenCalled()
  })

  it("skips refinement when one viewport fails permanently and the others succeed", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    let generateCalls = 0
    const fakeModel: LLMModel = {
      renderPrompt: async () => [{ role: "system", content: "You are a reviewer." }],
      generateObject: async <T>() => {
        generateCalls++
        return {
          object: { approved: true, reasoning: "unused", content: "" } as T,
        } as GenerateObjectResult<T>
      },
    }

    const initialHtml = '<section data-section-id="s1">Initial</section>'
    const attemptsByWidth = new Map<number, number>()
    const result = await runVisualReviewLoop({
      initialHtml,
      label: "book",
      pageId: "pg001",
      images: new Map(),
      deps: {
        llmModel: fakeModel,
        screenshotRenderer: {
          screenshot: async (_html, viewport) => {
            const width = viewport?.width ?? 0
            attemptsByWidth.set(width, (attemptsByWidth.get(width) ?? 0) + 1)
            // Only the desktop viewport is broken — tablet and mobile capture fine.
            if (width === 1280) throw new Error("page.screenshot: Timeout 60000ms exceeded.")
            return "aGVsbG8="
          },
          close: async () => {},
        },
        webAssetsDir: "/tmp/nonexistent",
      },
      promptName: "visual_review",
      maxIterations: 3,
      timeoutMs: 1000,
      firstIterationScreenshotsText: "first set",
      nextIterationScreenshotsText: "next set",
      trailingContextText: "Section type: text_only",
      validateHtml: () => ({ valid: true, errors: [] }),
    })

    // The reviewer prompt needs all three viewports, so a partial set is no more
    // usable than an empty one — skip refinement and keep the generated HTML.
    expect(result.html).toBe(initialHtml)
    expect(result.approved).toBe(false)
    expect(generateCalls).toBe(0)
    // The broken viewport retried once; the healthy ones were not re-captured.
    expect(attemptsByWidth.get(1280)).toBe(2)
    expect(attemptsByWidth.get(768)).toBe(1)
    expect(attemptsByWidth.get(390)).toBe(1)
  })

  it("retries a transient screenshot failure before giving up", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    const fakeModel: LLMModel = {
      renderPrompt: async () => [{ role: "system", content: "You are a reviewer." }],
      generateObject: async <T>() =>
        ({
          object: { approved: true, reasoning: "looks good", content: "" } as T,
        }) as GenerateObjectResult<T>,
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
            if (screenshotCalls === 1) throw new Error("Target page closed")
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
      validateHtml: () => ({ valid: true, errors: [] }),
    })

    expect(result.approved).toBe(true)
    // Three viewports, and only the one that failed is retried.
    expect(screenshotCalls).toBe(4)
  })

  it("propagates cancellation rather than treating it as a screenshot failure", async () => {
    const fakeModel: LLMModel = {
      renderPrompt: async () => [{ role: "system", content: "You are a reviewer." }],
      generateObject: async <T>() =>
        ({
          object: { approved: true, reasoning: "unused", content: "" } as T,
        }) as GenerateObjectResult<T>,
    }

    const controller = new AbortController()
    await expect(
      runVisualReviewLoop({
        initialHtml: '<section data-section-id="s1">Initial</section>',
        label: "book",
        pageId: "pg001",
        images: new Map(),
        deps: {
          llmModel: fakeModel,
          screenshotRenderer: {
            screenshot: async () => {
              controller.abort()
              throw new Error("Operation aborted")
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
        validateHtml: () => ({ valid: true, errors: [] }),
        signal: controller.signal,
      })
    ).rejects.toThrow()
  })
})

describe("resolveVisualReviewModelId", () => {
  const base = { structure_types: {}, role_types: {} } as AppConfig

  it("prefers the visual_review model, then default_model, then the built-in default", () => {
    expect(resolveVisualReviewModelId({ ...base, default_model: "openai:gpt-6-luna", visual_review: { model: "openai:gpt-6.1-sol" } })).toBe("openai:gpt-6.1-sol")
    expect(resolveVisualReviewModelId({ ...base, default_model: "anthropic:claude-opus-4" })).toBe("anthropic:claude-opus-4")
    expect(resolveVisualReviewModelId(base)).toBe(DEFAULT_LLM_MODEL_ID)
  })
})
