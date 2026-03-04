import { describe, expect, it } from "vitest"
import type { GenerateObjectResult, LLMModel } from "@adt/llm"
import { runVisualReviewLoop } from "../visual-review.js"

describe("runVisualReviewLoop", () => {
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

    // On the 4th call, history keeps initial turn and latest two turns:
    // Initial, v2, v3 (v1 is dropped).
    const fourthCall = userHtmlSnippetsByCall[3]
    expect(fourthCall).toHaveLength(3)
    expect(fourthCall[0]).toContain("Initial")
    expect(fourthCall[1]).toContain("v2")
    expect(fourthCall[2]).toContain("v3")
    expect(fourthCall.join(" ")).not.toContain("v1")
  })
})
