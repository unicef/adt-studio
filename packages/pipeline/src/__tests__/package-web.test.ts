import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import type { Storage, PageData } from "@adt/storage"
import { packageAdtWeb } from "../package-web.js"

function createMockStorage(
  pages: PageData[],
  nodeData: Record<string, Record<string, unknown>>,
): Storage {
  return {
    getLatestNodeData(node: string, itemId: string) {
      const data = nodeData[node]?.[itemId]
      return data !== undefined ? { version: 1, data } : null
    },
    getPages: () => pages,
    getPageImageBase64: () => "",
    getImageBase64: () => "",
    getPageImages: () => [],
    putNodeData: () => 1,
    clearExtractedData: () => {},
    putExtractedPage: () => {},
    appendLlmLog: () => {},
    close: () => {},
  }
}

function createWebAssets(webAssetsDir: string): void {
  fs.mkdirSync(webAssetsDir, { recursive: true })
  fs.writeFileSync(path.join(webAssetsDir, "base.bundle.min.js"), "// bundle")
  fs.writeFileSync(path.join(webAssetsDir, "fonts.css"), "body { font-family: serif; }")
  fs.writeFileSync(
    path.join(webAssetsDir, "tailwind_css.css"),
    "@tailwind base;\n@tailwind components;\n@tailwind utilities;\n",
  )
}

describe("packageAdtWeb", () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "package-web-"))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it("uses a safe default locale, avoids page-number carryover, and escapes inline answer JSON", async () => {
    const bookDir = path.join(tmpDir, "book")
    const webAssetsDir = path.join(tmpDir, "assets-web")
    fs.mkdirSync(bookDir, { recursive: true })
    createWebAssets(webAssetsDir)

    const pages: PageData[] = [
      { pageId: "pg001", pageNumber: 1, text: "Page one" },
      { pageId: "pg002", pageNumber: 2, text: "Page two" },
    ]

    const storage = createMockStorage(pages, {
      "web-rendering": {
        pg001: {
          sections: [
            {
              sectionIndex: 0,
              sectionType: "content",
              reasoning: "ok",
              html: "<div>First page</div>",
              activityAnswers: {
                q1: "</script><script>alert('x')</script>",
              },
            },
          ],
        },
        pg002: {
          sections: [
            {
              sectionIndex: 0,
              sectionType: "content",
              reasoning: "ok",
              html: "<div>Second page</div>",
            },
          ],
        },
      },
      "page-sectioning": {
        pg001: {
          reasoning: "ok",
          sections: [
            {
              sectionType: "content",
              partIds: [],
              backgroundColor: "#fff",
              textColor: "#000",
              pageNumber: 10,
              isPruned: false,
            },
          ],
        },
        pg002: {
          reasoning: "ok",
          sections: [
            {
              sectionType: "content",
              partIds: [],
              backgroundColor: "#fff",
              textColor: "#000",
              pageNumber: null,
              isPruned: false,
            },
          ],
        },
      },
      "text-catalog-translation": {
        fr: {
          entries: [{ id: "tx001", text: "Bonjour" }],
          generatedAt: "2026-01-01T00:00:00.000Z",
        },
      },
    })

    await packageAdtWeb(storage, {
      bookDir,
      label: "book",
      language: "en",
      outputLanguages: ["fr"],
      title: "Book Title",
      webAssetsDir,
    })

    const pagesJson = JSON.parse(
      fs.readFileSync(path.join(bookDir, "adt", "content", "pages.json"), "utf-8"),
    ) as Array<{ section_id: string; href: string; page_number?: number }>
    expect(pagesJson).toHaveLength(2)
    expect(pagesJson[0].page_number).toBe(10)
    expect(Object.prototype.hasOwnProperty.call(pagesJson[1], "page_number")).toBe(false)

    const configJson = JSON.parse(
      fs.readFileSync(path.join(bookDir, "adt", "assets", "config.json"), "utf-8"),
    ) as { languages: { default: string; available: string[] } }
    expect(configJson.languages.available).toEqual(["fr"])
    expect(configJson.languages.default).toBe("fr")

    const pageHtml = fs.readFileSync(path.join(bookDir, "adt", "pg001.html"), "utf-8")
    expect(pageHtml).toContain("window.correctAnswers = JSON.parse(")
    expect(pageHtml).not.toContain("</script><script>alert('x')</script>")
    expect(pageHtml).toContain("\\u003c/script\\u003e\\u003cscript\\u003e")
  })
})
