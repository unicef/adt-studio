import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import { createBookStorage } from "@adt/storage"

const llmMocks = vi.hoisted(() => ({
  generateObject: vi.fn(),
  createLLMModel: vi.fn(),
  createPromptEngine: vi.fn(),
}))

vi.mock("@adt/llm", () => ({
  createLLMModel: llmMocks.createLLMModel,
  createPromptEngine: llmMocks.createPromptEngine,
}))

import { reRenderPage, aiEditSection } from "./page-edit-service.js"

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
              parts: [{ type: "image", imageId: `${pageId}_im001`, isPruned: false }],
              backgroundColor: "#fff",
              textColor: "#000",
              pageNumber: 1,
              isPruned: false,
            },
            {
              sectionId: `${pageId}_sec002`,
              sectionType: "content",
              parts: [{ type: "image", imageId: `${pageId}_im002`, isPruned: false }],
              backgroundColor: "#fff",
              textColor: "#000",
              pageNumber: 1,
              isPruned: false,
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
            content: `<div id="content" class="container"><section role="article" data-section-type="${sectionType}" data-section-id="${sectionId}"><img data-id="${imageId}" src="/api/books/${label}/images/${imageId}" alt="img" /></section></div>`,
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
    })
  })

  describe("aiEditSection", () => {
    it("resolves section by sectionIndex value instead of array position", async () => {
      const pageId = `${label}_p1`
      const storage = createBookStorage(label, tmpDir)
      try {
        storage.putNodeData("web-rendering", pageId, {
          sections: [
            {
              sectionIndex: 0,
              sectionType: "content",
              reasoning: "ok",
              html: `<section data-id="first"><img data-id="img-first" src="/api/books/${label}/images/img-first" /></section>`,
            },
            {
              sectionIndex: 2,
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
  })
})
