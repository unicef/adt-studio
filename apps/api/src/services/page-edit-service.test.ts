import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import { createBookStorage } from "@adt/storage"
import { DEFAULT_LLM_MODEL_ID } from "@adt/types"

const llmMocks = vi.hoisted(() => ({
  generateObject: vi.fn(),
  createLLMModel: vi.fn(),
  createPromptEngine: vi.fn(),
}))

vi.mock("@adt/llm", () => ({
  createLLMModel: llmMocks.createLLMModel,
  createPromptEngine: llmMocks.createPromptEngine,
}))

const screenshotMocks = vi.hoisted(() => ({
  createScreenshotRenderer: vi.fn(),
  buildScreenshotHtml: vi.fn(),
}))

vi.mock("@adt/pipeline", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@adt/pipeline")>()),
  createScreenshotRenderer: screenshotMocks.createScreenshotRenderer,
  buildScreenshotHtml: screenshotMocks.buildScreenshotHtml,
}))

import { reRenderPage, aiEditSection, findInventedImages } from "./page-edit-service.js"

describe("page-edit-service", () => {
  let tmpDir: string
  const label = "test-book"

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "page-edit-svc-"))
    llmMocks.generateObject.mockReset()
    llmMocks.createLLMModel.mockReset()
    llmMocks.createPromptEngine.mockReset()
    llmMocks.createPromptEngine.mockReturnValue({} as never)
    llmMocks.createLLMModel.mockReturnValue({
      generateObject: llmMocks.generateObject,
    } as never)
    screenshotMocks.buildScreenshotHtml.mockReset()
    screenshotMocks.buildScreenshotHtml.mockResolvedValue("<html></html>")
    screenshotMocks.createScreenshotRenderer.mockReset()
    screenshotMocks.createScreenshotRenderer.mockResolvedValue({
      screenshot: vi.fn().mockResolvedValue(Buffer.from("screenshot").toString("base64")),
      close: vi.fn().mockResolvedValue(undefined),
    })

    // Create a book with extracted pages but no pipeline data
    const storage = createBookStorage(label, tmpDir)
    try {
      const fakeImage = {
        imageId: `${label}_p1_page`,
        buffer: Buffer.from("fake-png-data"),
        format: "png" as const,
        hash: "abc123",
        width: 800,
        height: 600,
      }
      storage.putExtractedPage({
        pageId: `${label}_p1`,
        pageNumber: 1,
        text: "Page one text content",
        pageImage: fakeImage,
        images: [
          {
            imageId: `${label}_p1_im001`,
            buffer: Buffer.from("fake-image-1"),
            format: "png" as const,
            hash: "img-1",
            width: 320,
            height: 240,
          },
          {
            imageId: `${label}_p1_im002`,
            buffer: Buffer.from("fake-image-2"),
            format: "png" as const,
            hash: "img-2",
            width: 320,
            height: 240,
          },
        ],
      })
    } finally {
      storage.close()
    }
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  describe("reRenderPage", () => {
    it("throws when pipeline data is missing", async () => {
      await expect(
        reRenderPage({
          label,
          pageId: `${label}_p1`,
          booksDir: tmpDir,
          promptsDir: tmpDir,
          apiKey: "test-key",
        })
      ).rejects.toThrow(
        "Page must have page-sectioning data before re-rendering"
      )
    })

    it("re-renders only the requested section index and merges it", async () => {
      const pageId = `${label}_p1`
      const storage = createBookStorage(label, tmpDir)
      try {
        storage.putNodeData("page-sectioning", pageId, {
          reasoning: "ok",
          sections: [
            {
              sectionId: `${pageId}_sec001`,
              sectionType: "content",
              backgroundColor: "#fff",
              textColor: "#000",
              pageNumber: 1,
              isPruned: false,
              nodes: [
                {
                  nodeId: `${pageId}_n001`,
                  isPruned: false,
                  structure: "image_group",
                  children: [
                    { nodeId: `${pageId}_im001`, isPruned: false, role: "image" },
                  ],
                },
              ],
            },
            {
              sectionId: `${pageId}_sec002`,
              sectionType: "content",
              backgroundColor: "#fff",
              textColor: "#000",
              pageNumber: 1,
              isPruned: false,
              nodes: [
                {
                  nodeId: `${pageId}_n002`,
                  isPruned: false,
                  structure: "image_group",
                  children: [
                    { nodeId: `${pageId}_im002`, isPruned: false, role: "image" },
                  ],
                },
              ],
            },
          ],
        })
        storage.putNodeData("web-rendering", pageId, {
          sections: [
            {
              sectionIndex: 0,
              sectionType: "content",
              reasoning: "old",
              html: "<section data-section-id=\"test-book_p1_sec001\"><p>old-sec1</p></section>",
            },
            {
              sectionIndex: 1,
              sectionType: "content",
              reasoning: "old",
              html: "<section data-section-id=\"test-book_p1_sec002\"><p>old-sec2</p></section>",
            },
          ],
        })
        storage.putNodeData("easy-read", "book", {
          blocks: [{
            pageId,
            pageNumber: 1,
            sectionId: `${pageId}_sec001`,
            sectionIndex: 0,
            sectionType: "content",
            entries: [{
              sourceId: `${pageId}_n001`,
              easyReadId: `${pageId}_n001_easy_read`,
              originalText: "Old text",
              text: "Old easy text",
              pageId,
              sectionId: `${pageId}_sec001`,
              sectionIndex: 0,
            }],
          }],
          generatedAt: "2026-01-01T00:00:00.000Z",
        })
        storage.putNodeData("text-catalog", "book", { entries: [{ id: "t1", text: "Old text" }] })
        storage.putNodeData("text-catalog-translation", "es", { entries: [{ id: "t1", text: "Texto viejo" }] })
        storage.putNodeData("tts", "en", { entries: [{ textId: "t1", fileName: "t1.mp3" }] })
        storage.putNodeData("tts-timestamps", "en", { entries: { t1: { words: [{ text: "Old", start: 0, end: 1 }] } } })
        storage.putNodeData("accessibility-assessment", "book", { pages: [] })
        for (const step of [
          "image-captioning",
          "text-catalog",
          "easy-read",
          "catalog-translation",
          "image-translation",
          "tts",
          "word-timestamps",
          "package-web",
          "accessibility-assessment",
        ]) {
          storage.markStepCompleted(step)
        }
      } finally {
        storage.close()
      }
      fs.writeFileSync(
        path.join(tmpDir, label, "config.yaml"),
        "default_render_strategy: llm\n"
      )

      llmMocks.generateObject.mockImplementation(async (opts: unknown) => {
        const context = (opts as {
          context: {
            section_id: string
            section_type: string
            images: Array<{ image_id: string }>
          }
        }).context
        const sectionId = context.section_id
        const sectionType = context.section_type
        const imageId = context.images[0]?.image_id
        return {
          object: {
            reasoning: "rerendered",
            content: `<div id="content" class="container"><section data-section-type="${sectionType}" data-section-id="${sectionId}"><img data-id="${imageId}" src="/api/books/${label}/images/${imageId}" alt="img" /></section></div>`,
          },
        } as never
      })

      const result = await reRenderPage({
        label,
        pageId,
        sectionIndex: 1,
        booksDir: tmpDir,
        promptsDir: tmpDir,
        configPath: path.resolve(process.cwd(), "config.yaml"),
        apiKey: "test-key",
      })

      expect(llmMocks.generateObject).toHaveBeenCalledTimes(1)
      const rendering = result.rendering as {
        sections: Array<{ sectionIndex: number; html: string }>
      }
      expect(rendering.sections).toHaveLength(2)
      expect(rendering.sections.find((s) => s.sectionIndex === 0)?.html).toContain("old-sec1")
      expect(rendering.sections.find((s) => s.sectionIndex === 1)?.html).toContain(`${pageId}_im002`)
      expect(rendering.sections.find((s) => s.sectionIndex === 1)?.html).not.toContain(`${pageId}_im001`)

      const verifyStorage = createBookStorage(label, tmpDir)
      try {
        expect(verifyStorage.getLatestNodeData("easy-read", "book")).toMatchObject({ version: 1 })
        expect(verifyStorage.getLatestNodeData("text-catalog", "book")).not.toBeNull()
        expect(verifyStorage.getLatestNodeData("text-catalog-translation", "es")).toMatchObject({ version: 1 })
        expect(verifyStorage.getLatestNodeData("tts", "en")).toMatchObject({ version: 1 })
        expect(verifyStorage.getLatestNodeData("tts-timestamps", "en")).toMatchObject({ version: 1 })
        expect(verifyStorage.getLatestNodeData("accessibility-assessment", "book")).toBeNull()
        const clearedSteps = new Set(verifyStorage.getStepRuns().map((run) => run.step))
        for (const step of [
          "image-captioning",
          "text-catalog",
          "easy-read",
          "catalog-translation",
          "image-translation",
          "tts",
          "word-timestamps",
          "package-web",
          "accessibility-assessment",
        ]) {
          expect(clearedSteps.has(step)).toBe(true)
        }
      } finally {
        verifyStorage.close()
      }
    })
  })

  describe("findInventedImages", () => {
    const original = `<section><img data-id="a" src="/api/books/b/images/a" /><img data-id="b" src="/api/books/b/images/b" /></section>`

    it("accepts reordered and removed existing images", () => {
      expect(findInventedImages(original, `<section><img src="/api/books/b/images/b" data-id="b"></section>`)).toEqual([])
    })

    it("flags images with a source or id the section never had", () => {
      expect(findInventedImages(original, `<section><img data-id="a" src="https://example.com/new.png" /></section>`))
        .toEqual(["https://example.com/new.png"])
      expect(findInventedImages(original, `<section><img data-id="new" src="/api/books/b/images/a" /></section>`))
        .toEqual(["/api/books/b/images/a"])
      expect(findInventedImages(original, `<section><img data-id="a" /></section>`)).toEqual(["a"])
    })

    it("flags new images in srcset, picture sources, svg images, and CSS backgrounds", () => {
      expect(findInventedImages(original, `<section><img data-id="a" src="/api/books/b/images/a" srcset="/new-2x.png 2x" /></section>`))
        .toEqual(["/new-2x.png"])
      expect(findInventedImages(original, `<section><picture><source srcset="/new.webp" /><img data-id="a" src="/api/books/b/images/a" /></picture></section>`))
        .toEqual(["/new.webp"])
      expect(findInventedImages(original, `<section><svg><image href="/new.svg" /></svg></section>`))
        .toEqual(["/new.svg"])
      expect(findInventedImages(original, `<section><div style="background-image: url(&quot;https://example.com/bg.png&quot;)"></div></section>`))
        .toEqual(["https://example.com/bg.png"])
    })

    it("accepts existing images reused as CSS backgrounds", () => {
      expect(findInventedImages(original, `<section><div style="background-image: url('/api/books/b/images/a')"></div></section>`))
        .toEqual([])
    })

    it("ignores in-document SVG references such as gradients and patterns", () => {
      expect(findInventedImages(original, `<section><svg><defs><linearGradient id="g" /></defs><rect fill="url(#g)" style="stroke: url('#g')" /></svg></section>`))
        .toEqual([])
    })

    it("treats SVG data URIs in CSS as vector drawing unless they embed new images", () => {
      const pattern = encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg"><circle r="2" fill="url(#dot)" /></svg>`)
      expect(findInventedImages(original, `<section><div style="background-image: url(&quot;data:image/svg+xml,${pattern}&quot;)"></div></section>`))
        .toEqual([])
      const base64Pattern = Buffer.from(`<svg><path d="M0 0h4" /></svg>`).toString("base64")
      expect(findInventedImages(original, `<section><div style="background: url(data:image/svg+xml;base64,${base64Pattern})"></div></section>`))
        .toEqual([])
      const embedding = encodeURIComponent(`<svg><image href="https://example.com/photo.png" /></svg>`)
      expect(findInventedImages(original, `<section><div style="background-image: url('data:image/svg+xml;charset=utf-8,${embedding}')"></div></section>`))
        .toEqual(["https://example.com/photo.png"])
      expect(findInventedImages(original, `<section><div style="background-image: url(data:image/png;base64,iVBORw0KGgo=)"></div></section>`))
        .toEqual(["data:image/png;base64,iVBORw0KGgo="])
    })

    it("reads unquoted attributes and quoted values containing >", () => {
      expect(findInventedImages(original, `<section><img alt="a > b" data-id=a src=/api/books/b/images/a></section>`))
        .toEqual([])
      expect(findInventedImages(original, `<section><img alt="a > b" data-id="a" src="/new.png"></section>`))
        .toEqual(["/new.png"])
    })
  })

  describe("aiEditSection", () => {
    const imageHtml = `<section><img data-id="${label}_p1_im001" src="/api/books/${label}/images/${label}_p1_im001" /><img data-id="${label}_p1_im002" src="/api/books/${label}/images/${label}_p1_im002" /></section>`

    type EditResponse = { reasoning: string; feasible: boolean; unsupported_reason: string; content: string }
    type Validate = (result: EditResponse, context: Record<string, unknown>) => { valid: boolean; errors: string[] }

    const editResponse = (overrides: Partial<EditResponse> = {}) =>
      ({ object: { reasoning: "ok", feasible: true, unsupported_reason: "", content: imageHtml, ...overrides } }) as never

    const promptNameOf = (opts: unknown) => (opts as { prompt: string }).prompt

    const runImageEdit = (instruction: string, webAssetsDir?: string) =>
      aiEditSection({
        label,
        pageId: `${label}_p1`,
        sectionIndex: 0,
        instruction,
        currentHtml: imageHtml,
        booksDir: tmpDir,
        promptsDir: tmpDir,
        webAssetsDir,
        configPath: path.resolve(process.cwd(), "config.yaml"),
        apiKey: "test-key",
      } as Parameters<typeof aiEditSection>[0])

    it("reports an instruction AI editing cannot do without verifying it", async () => {
      llmMocks.generateObject.mockResolvedValue(
        editResponse({
          reasoning: "The instruction asks to redraw the images.",
          feasible: false,
          unsupported_reason: "AI editing can't change images. Use the image tools instead.",
        })
      )

      const result = await runImageEdit("Modify all the images on this page", tmpDir)

      expect(result).toEqual({
        status: "unsupported",
        reason: "AI editing can't change images. Use the image tools instead.",
        reasoning: "The instruction asks to redraw the images.",
      })
      expect(llmMocks.generateObject).toHaveBeenCalledTimes(1)
      expect(promptNameOf(llmMocks.generateObject.mock.calls[0][0])).toBe("html_edit")
    })

    it("rejects invented images and unexplained unsupported answers", async () => {
      let validate: Validate | undefined
      llmMocks.generateObject.mockImplementation(async (opts: unknown) => {
        validate = (opts as { validate: Validate }).validate
        return editResponse()
      })

      await runImageEdit("Replace the images with new drawings")

      const invented = validate!(
        { reasoning: "", feasible: true, unsupported_reason: "", content: `<section><img data-id="new_drawing" src="https://example.com/drawing.png" /></section>` },
        {},
      )
      expect(invented.valid).toBe(false)
      expect(invented.errors).toContainEqual(expect.stringContaining("cannot create or change images"))

      const removed = validate!(
        { reasoning: "", feasible: true, unsupported_reason: "", content: `<section><img data-id="${label}_p1_im002" src="/api/books/${label}/images/${label}_p1_im002" /></section>` },
        {},
      )
      expect(removed.valid).toBe(true)

      expect(validate!({ reasoning: "", feasible: false, unsupported_reason: " ", content: "" }, {}).valid).toBe(false)
      expect(validate!({ reasoning: "", feasible: false, unsupported_reason: "Not possible.", content: "" }, {}).valid).toBe(true)
    })

    it("retries once and reports a verification that still fails", async () => {
      const editedHtml = imageHtml.replace("<section>", `<section class="bg-blue-50">`)
      llmMocks.generateObject.mockImplementation(async (opts: unknown) =>
        promptNameOf(opts) === "html_edit_verify"
          ? ({ object: { applied: false, reason: "The background is unchanged." } } as never)
          : editResponse({ content: editedHtml })
      )

      const result = await runImageEdit("Make the background blue", tmpDir)

      expect(result).toMatchObject({
        status: "applied",
        html: editedHtml,
        verification: { applied: false, reason: "The background is unchanged." },
      })
      const prompts = llmMocks.generateObject.mock.calls.map(([opts]) => promptNameOf(opts))
      expect(prompts).toEqual(["html_edit", "html_edit_verify", "html_edit", "html_edit_verify"])
    })

    it("reports unsupported when the retry concludes the edit is not possible", async () => {
      let editCalls = 0
      llmMocks.generateObject.mockImplementation(async (opts: unknown) => {
        if (promptNameOf(opts) === "html_edit_verify") {
          return { object: { applied: false, reason: "The images are unchanged." } } as never
        }
        editCalls += 1
        return editCalls === 1
          ? editResponse()
          : editResponse({ feasible: false, unsupported_reason: "Images can only be changed with the image tools." })
      })

      const result = await runImageEdit("Make every image black and white", tmpDir)

      expect(result).toMatchObject({
        status: "unsupported",
        reason: "Images can only be changed with the image tools.",
      })
    })

    it("resolves a stable owner at the selected source index despite sparse rendered positions", async () => {
      const pageId = `${label}_p1`
      const storage = createBookStorage(label, tmpDir)
      try {
        storage.putNodeData("page-sectioning", pageId, { reasoning: "source", sections: ["first", "pruned", "dup"].map(sectionId => ({
          sectionId, sectionType: "content", backgroundColor: "white", textColor: "black", pageNumber: 1, isPruned: sectionId === "pruned", nodes: [],
        })) })
        storage.putNodeData("web-rendering", pageId, {
          sections: [
            {
              sectionIndex: 0, sectionId: "first",
              sectionType: "content",
              reasoning: "ok",
              html: `<section data-id="first"><img data-id="img-first" src="/api/books/${label}/images/img-first" /></section>`,
            },
            {
              sectionIndex: 42, sectionId: "dup",
              sectionType: "content",
              reasoning: "ok",
              html: `<section data-id="dup"><img data-id="img-dup" src="/api/books/${label}/images/img-dup" /></section>`,
            },
          ],
        })
      } finally {
        storage.close()
      }

      let capturedHtml = ""
      llmMocks.generateObject.mockImplementation(async (opts: unknown) => {
        const context = (opts as { context: { current_html: string } }).context
        capturedHtml = context.current_html
        return {
          object: {
            reasoning: "ok",
            feasible: true,
            unsupported_reason: "",
            content: context.current_html,
          },
        } as never
      })

      const result = await aiEditSection({
        label,
        pageId,
        sectionIndex: 2,
        instruction: "Keep layout and wording",
        booksDir: tmpDir,
        promptsDir: tmpDir,
        configPath: path.resolve(process.cwd(), "config.yaml"),
        apiKey: "test-key",
      })

      expect(capturedHtml).toContain("img-dup")
      expect(capturedHtml).not.toContain("img-first")
      expect(result.html).toContain("img-dup")
    })

    it("synchronizes ordering metadata with an AI-edited HTML order", async () => {
      const currentHtml = `
        <section data-section-type="activity_ordering" data-correct-order="item-2,item-1,item-3">
          <ol data-activity-order-list>
            <li data-activity-item="item-1">One</li>
            <li data-activity-item="item-2">Two</li>
            <li data-activity-item="item-3">Three</li>
          </ol>
        </section>`
      const editedHtml = currentHtml.replace(
        "item-2,item-1,item-3",
        "item-3,item-2,item-1",
      )
      llmMocks.generateObject.mockResolvedValue({
        object: { reasoning: "Changed the sequence", feasible: true, unsupported_reason: "", content: editedHtml },
      } as never)

      const result = await aiEditSection({
        label,
        pageId: `${label}_p1`,
        sectionIndex: 0,
        instruction: "Reverse the correct order",
        currentHtml,
        booksDir: tmpDir,
        promptsDir: tmpDir,
        configPath: path.resolve(process.cwd(), "config.yaml"),
        apiKey: "test-key",
      })

      expect(result.activityAnswers).toEqual({
        "item-3": "1",
        "item-2": "2",
        "item-1": "3",
      })
    })

    it.each([
      {
        name: "generic markup",
        invalidHtml: `<section><div class="text-4xl" data-id="section-title">Section title</div></section>`,
      },
      {
        name: "a changed level",
        invalidHtml: `<section><h3 class="adt-h2" data-id="section-title">Section title</h3></section>`,
      },
      {
        name: "a local font-size override",
        invalidHtml: `<section><h2 class="adt-h2 text-4xl" data-id="section-title">Section title</h2></section>`,
      },
    ])("rejects $name and accepts a hierarchy-preserving AI edit", async ({ invalidHtml }) => {
      const currentHtml = `<section><h2 class="adt-h2" data-id="section-title">Section title</h2></section>`
      const validHtml = `<section class="bg-blue-50"><h2 class="adt-h2 text-blue-700 mt-4" data-id="section-title">Section title</h2></section>`
      let rejectionErrors: string[] = []

      llmMocks.generateObject.mockImplementation(async (opts: unknown) => {
        const editOptions = opts as {
          validate?: (result: unknown, context: Record<string, unknown>) => {
            valid: boolean
            errors: string[]
          }
          maxRetries?: number
        }
        expect(editOptions.maxRetries).toBe(3)
        const rejected = editOptions.validate?.(
          { reasoning: "Changed the background", feasible: true, unsupported_reason: "", content:invalidHtml },
          {},
        )
        expect(rejected?.valid).toBe(false)
        rejectionErrors = rejected?.errors ?? []

        const accepted = editOptions.validate?.(
          { reasoning: "Changed the background", feasible: true, unsupported_reason: "", content:validHtml },
          {},
        )
        expect(accepted?.valid).toBe(true)
        return {
          object: { reasoning: "Changed the background", feasible: true, unsupported_reason: "", content:validHtml },
        } as never
      })

      const result = await aiEditSection({
        label,
        pageId: `${label}_p1`,
        sectionIndex: 0,
        instruction: "Change the background color and add spacing",
        currentHtml,
        booksDir: tmpDir,
        promptsDir: tmpDir,
        configPath: path.resolve(process.cwd(), "config.yaml"),
        apiKey: "test-key",
      })

      expect(rejectionErrors).toContainEqual(expect.stringContaining("Sectioning"))
      expect(result.html).toBe(validHtml)
      expect(result.html).toContain('<h2 class="adt-h2 text-blue-700 mt-4"')
    })

    it.each([
      {
        name: "uses page_sectioning.model when configured",
        defaultModelId: "openai:gpt-4.1",
        pageSectioningModelId: "openai:gpt-4o",
        expectedModelId: "openai:gpt-4o",
      },
      {
        // Regression: `page_sectioning` present without a `model` key used to
        // yield `modelId: undefined`, which blew up inside resolveModel.
        name: "falls back to default_model when page_sectioning has no model",
        defaultModelId: "openai:gpt-4.1",
        pageSectioningModelId: undefined,
        expectedModelId: "openai:gpt-4.1",
      },
      {
        name: "falls back to DEFAULT_LLM_MODEL_ID when no model is configured",
        defaultModelId: undefined,
        pageSectioningModelId: undefined,
        expectedModelId: DEFAULT_LLM_MODEL_ID,
      },
    ])("$name", async ({
      defaultModelId,
      pageSectioningModelId,
      expectedModelId,
    }) => {
      const pageId = `${label}_p1`
      const storage = createBookStorage(label, tmpDir)
      try {
        storage.putNodeData("page-sectioning", pageId, { reasoning: "source", sections: [{
          sectionId: "first", sectionType: "content", backgroundColor: "white", textColor: "black", pageNumber: 1, isPruned: false, nodes: [],
        }] })
        storage.putNodeData("web-rendering", pageId, {
          sections: [
            {
              sectionIndex: 0, sectionId: "first",
              sectionType: "content",
              reasoning: "ok",
              html: `<section data-id="first">hello</section>`,
            },
          ],
        })
      } finally {
        storage.close()
      }

      const configPath = path.join(tmpDir, "config.yaml")
      fs.writeFileSync(
        configPath,
        [
          ...(defaultModelId ? [`default_model: "${defaultModelId}"`] : []),
          "structure_types: {}",
          "role_types: {}",
          "page_sectioning:",
          "  prompt: page_sectioning",
          "  max_refinements: 0",
          ...(pageSectioningModelId
            ? [`  model: "${pageSectioningModelId}"`]
            : []),
        ].join("\n")
      )

      llmMocks.generateObject.mockImplementation(async (opts: unknown) => {
        const context = (opts as { context: { current_html: string } }).context
        return {
          object: { reasoning: "ok", feasible: true, unsupported_reason: "", content: context.current_html },
        } as never
      })

      await aiEditSection({
        label,
        pageId,
        sectionIndex: 0,
        instruction: "Keep layout and wording",
        booksDir: tmpDir,
        promptsDir: tmpDir,
        configPath,
        apiKey: "test-key",
      })

      expect(llmMocks.createLLMModel).toHaveBeenCalledWith(
        expect.objectContaining({ modelId: expectedModelId })
      )
    })
  })
})


it.each([false, true])("section re-render after source reorder retains the other owner (legacy=%s)", async legacy => {
  const booksDir = fs.mkdtempSync(path.join(os.tmpdir(), "adt-rerender-owner-"))
  const label = "owners"
  const pageId = "pg001"
  const section = (letter: "A" | "B") => ({
    sectionId: `pg001_sec00${letter === "A" ? 1 : 2}`,
    sectionType: "content", backgroundColor: "white", textColor: "black", pageNumber: 1, isPruned: false,
    nodes: [{ nodeId: letter, role: "body_text", text: letter, isPruned: false }],
  })
  const storage = createBookStorage(label, booksDir)
  try {
    storage.putExtractedPage({ pageId, pageNumber: 1, text: "", pageImage: { imageId: "pg001_page", buffer: Buffer.from("image"), format: "png", hash: "page", width: 10, height: 10 }, images: [] })
    storage.putNodeData("page-sectioning", pageId, { reasoning: "reordered", sections: [section("B"), section("A")] })
    storage.putNodeData("web-rendering", pageId, {
      sections: (["A", "B"] as const).map((letter, sectionIndex) => ({
        ...(legacy ? {} : { sectionId: section(letter).sectionId }), sectionIndex, sectionType: "content", reasoning: "old",
        html: `<section${legacy ? "" : ` data-section-id="${section(letter).sectionId}"`}><p data-id="${letter}">${letter}</p></section>`,
      })),
    })
    fs.writeFileSync(path.join(storage.bookDir!, "config.yaml"), "default_render_strategy: llm\n")
  } finally { storage.close() }
  llmMocks.createPromptEngine.mockReturnValue({} as never)
  llmMocks.createLLMModel.mockReturnValue({ generateObject: llmMocks.generateObject } as never)
  llmMocks.generateObject.mockImplementation(async (options: { context: { section_id: string } }) => ({
    object: { reasoning: "new B", content: `<section data-section-id="${options.context.section_id}"><p data-id="B">B</p></section>` },
  }))
  try {
    const result = await reRenderPage({ label, pageId, sectionIndex: 0, booksDir, promptsDir: path.resolve("prompts"), configPath: path.resolve("config.yaml"), credentials: {} })
    const rows = (result.rendering as import("@adt/types").WebRenderingOutput).sections
    expect(rows.map((row) => row.sectionId).sort()).toEqual(["pg001_sec001", "pg001_sec002"])
    expect(rows.find((row) => row.sectionId === "pg001_sec001")?.html).toBe(legacy ? '<section><p data-id="A">A</p></section>' : '<section data-section-id="pg001_sec001"><p data-id="A">A</p></section>')
  } finally { fs.rmSync(booksDir, { recursive: true, force: true }) }
})


it.each([false, true])("preserves positioned pages and avoids providers on unsafe scoped/legacy reflow (legacy=%s)", async legacy => {
  const booksDir = fs.mkdtempSync(path.join(os.tmpdir(), "adt-fixed-rerender-"))
  const label = "fixed"
  const storage = createBookStorage(label, booksDir)
  const source = { reasoning: "", sections: [{ sectionId: "pg001_sec001", sectionType: "content", backgroundColor: "white", textColor: "black", pageNumber: 1, isPruned: false, nodes: [{ nodeId: "text", role: "body_text", text: "Retained", isPruned: false }] }] }
  const positioned = { reasoning: "", sections: [{ ...source.sections[0], sectionType: "fixed-layout-page", viewport: { width: 100, height: 100 }, placement: { text: { position: { top: 0, left: 0, lineHeight: 10 } } }, nodes: source.sections[0].nodes }] }
  const rendering = { sections: [{ sectionId: "pg001_sec001", sectionIndex: 0, sectionType: "fixed-layout-page", reasoning: "", html: '<section data-section-id="pg001_sec001"><p data-id="text">Retained</p></section>' }] }
  try {
    storage.putExtractedPage({ pageId: "pg001", pageNumber: 1, text: "", pageImage: { imageId: "pg001_page", buffer: Buffer.from("image"), format: "png", hash: "page", width: 100, height: 100 }, images: [] })
    storage.putNodeData("page-sectioning", "pg001", legacy ? positioned : source)
    if (!legacy) storage.putNodeData("fixed-layout-sectioning", "pg001", positioned)
    storage.putNodeData("web-rendering", "pg001", rendering)
    const before = storage.getLatestNodeData("web-rendering", "pg001")
    llmMocks.createLLMModel.mockClear()
    await expect(reRenderPage({ label, pageId: "pg001", ...(legacy ? {} : { sectionIndex: 0 }), booksDir, promptsDir: path.resolve("prompts"), configPath: path.resolve("config.yaml"), credentials: {} })).rejects.toMatchObject({ status: 409 })
    expect(llmMocks.createLLMModel).not.toHaveBeenCalled()
    expect(storage.getLatestNodeData("web-rendering", "pg001")).toEqual(before)
    expect(storage.getAllNodeVersions("web-rendering", "pg001")).toHaveLength(1)
  } finally { storage.close(); fs.rmSync(booksDir, { recursive: true, force: true }) }
})
