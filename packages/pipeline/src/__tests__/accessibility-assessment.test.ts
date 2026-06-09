import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import type { Storage, PageData } from "@adt/storage"
import { runAccessibilityAssessment } from "../accessibility-assessment.js"
import { isAxeInternalError, mergeAccessibilityResults } from "../accessibility-assessment-shared.js"
import { packageAdtWeb } from "../packaging/web.js"
import type { AccessibilityAssessmentOutput, BrowserAccessibilityAssessmentOutput } from "@adt/types"

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
    getSignLanguageVideos: () => [],
    getSignLanguageVideoPath: () => null,
    close: () => {},
  }
}

function createWebAssets(webAssetsDir: string): void {
  fs.mkdirSync(webAssetsDir, { recursive: true })
  fs.writeFileSync(path.join(webAssetsDir, "base.js"), 'window.__ADT_BUNDLE_TEST__ = "ok";\n')
  fs.writeFileSync(path.join(webAssetsDir, "fonts.css"), "body { font-family: serif; }")
  fs.writeFileSync(
    path.join(webAssetsDir, "tailwind_css.css"),
    "@tailwind base;\n@tailwind components;\n@tailwind utilities;\n",
  )
}

describe("isAxeInternalError", () => {
  it("returns true when all nodes report axe-internal errors", () => {
    expect(isAxeInternalError({
      id: "landmark-one-main",
      impact: "moderate",
      description: "",
      help: "",
      helpUrl: "",
      tags: [],
      nodes: [
        { target: ["html"], failureSummary: "Fix all of the following:\n  Axe encountered an error; test the page for this type of problem manually" },
      ],
    })).toBe(true)
  })

  it("returns false for real failures", () => {
    expect(isAxeInternalError({
      id: "image-alt",
      impact: "critical",
      description: "",
      help: "",
      helpUrl: "",
      tags: [],
      nodes: [
        { target: ["img"], html: "<img src=\"x.png\">", failureSummary: "Fix any of the following:\n  Element does not have an alt attribute" },
      ],
    })).toBe(false)
  })

  it("returns false for findings with no nodes", () => {
    expect(isAxeInternalError({
      id: "test",
      impact: null,
      description: "",
      help: "",
      helpUrl: "",
      tags: [],
      nodes: [],
    })).toBe(false)
  })
})

describe("mergeAccessibilityResults", () => {
  const makeFinding = (id: string, failureSummary?: string) => ({
    id,
    impact: "moderate" as const,
    description: "",
    help: "",
    helpUrl: "",
    tags: [],
    nodes: [{ target: ["html"], failureSummary: failureSummary ?? `Issue: ${id}` }],
  })

  const basePage = {
    pageId: "pg001",
    sectionId: "pg001_sec001",
    href: "index.html",
    pageNumber: 1,
    title: "Page",
    violationCount: 1,
    incompleteCount: 2,
    passCount: 5,
    inapplicableCount: 0,
    violations: [makeFinding("image-alt")],
    incomplete: [
      makeFinding("landmark-one-main", "Axe encountered an error; test the page for this type of problem manually"),
      makeFinding("page-has-heading-one", "Axe encountered an error; test the page for this type of problem manually"),
    ],
  }

  const base: AccessibilityAssessmentOutput = {
    generatedAt: "2026-01-01T00:00:00Z",
    tool: "axe-core",
    runOnlyTags: ["wcag2a"],
    disabledRules: [],
    pages: [basePage],
    summary: { pageCount: 1, pagesWithViolations: 1, pagesWithErrors: 0, violationCount: 1, incompleteCount: 2 },
  }

  it("replaces JSDOM incompletes with browser results for rechecked rules", () => {
    const browser: BrowserAccessibilityAssessmentOutput = {
      generatedAt: "2026-01-01T00:01:00Z",
      tool: "axe-core-playwright",
      baseGeneratedAt: base.generatedAt,
      ruleIds: ["landmark-one-main", "page-has-heading-one", "color-contrast"],
      pages: [{
        ...basePage,
        recheckedRuleIds: ["landmark-one-main", "page-has-heading-one", "color-contrast"],
        violations: [makeFinding("color-contrast")],
        violationCount: 1,
        incomplete: [],
        incompleteCount: 0,
        passCount: 2,
      }],
      summary: { pageCount: 1, recheckedPageCount: 1, pagesWithViolations: 1, pagesWithErrors: 0, violationCount: 1, incompleteCount: 0 },
    }

    const merged = mergeAccessibilityResults(base, browser)

    expect(merged.pages[0].violations.map((f) => f.id)).toEqual(["image-alt", "color-contrast"])
    expect(merged.pages[0].incomplete).toEqual([])
    expect(merged.summary.violationCount).toBe(2)
    expect(merged.summary.incompleteCount).toBe(0)
  })

  it("preserves JSDOM incompletes for rules NOT rechecked by browser", () => {
    const browser: BrowserAccessibilityAssessmentOutput = {
      generatedAt: "2026-01-01T00:01:00Z",
      tool: "axe-core-playwright",
      baseGeneratedAt: base.generatedAt,
      ruleIds: ["landmark-one-main"],
      pages: [{
        ...basePage,
        recheckedRuleIds: ["landmark-one-main"],
        violations: [],
        violationCount: 0,
        incomplete: [],
        incompleteCount: 0,
        passCount: 1,
      }],
      summary: { pageCount: 1, recheckedPageCount: 1, pagesWithViolations: 0, pagesWithErrors: 0, violationCount: 0, incompleteCount: 0 },
    }

    const merged = mergeAccessibilityResults(base, browser)

    // page-has-heading-one was NOT rechecked, so its incomplete stays
    expect(merged.pages[0].incomplete.map((f) => f.id)).toEqual(["page-has-heading-one"])
    expect(merged.summary.incompleteCount).toBe(1)
  })
})

describe("runAccessibilityAssessment", () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "a11y-assessment-"))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it("audits packaged pages and reports axe violations", async () => {
    const bookDir = path.join(tmpDir, "book")
    const adtDir = path.join(bookDir, "adt")
    const contentDir = path.join(adtDir, "content")
    fs.mkdirSync(contentDir, { recursive: true })

    fs.writeFileSync(
      path.join(contentDir, "pages.json"),
      JSON.stringify([
        { section_id: "pg001_sec001", href: "index.html", page_number: 1 },
        { section_id: "qz001", href: "quiz.html" },
      ])
    )

    fs.writeFileSync(
      path.join(adtDir, "index.html"),
      '<!doctype html><html lang="en"><head><title>Page One</title></head><body><main><img src="cover.png"></main></body></html>'
    )
    fs.writeFileSync(
      path.join(adtDir, "quiz.html"),
      '<!doctype html><html lang="en"><head><title>Quiz</title></head><body><main><button aria-label="Continue">Go</button></main></body></html>'
    )

    const result = await runAccessibilityAssessment({ bookDir })

    expect(result.tool).toBe("axe-core")
    expect(result.summary.pageCount).toBe(2)
    expect(result.pages[0].pageId).toBe("pg001")
    expect(result.pages[0].title).toBe("Page One")
    expect(result.pages[0].violations.some((item) => item.id === "image-alt")).toBe(true)
  })

  it("uses configured run tags and disabled rules", async () => {
    const bookDir = path.join(tmpDir, "book")
    const adtDir = path.join(bookDir, "adt")
    const contentDir = path.join(adtDir, "content")
    fs.mkdirSync(contentDir, { recursive: true })

    fs.writeFileSync(
      path.join(contentDir, "pages.json"),
      JSON.stringify([{ section_id: "pg001_sec001", href: "index.html", page_number: 1 }])
    )

    fs.writeFileSync(
      path.join(adtDir, "index.html"),
      '<!doctype html><html lang="en"><head><title>Page One</title></head><body><main><img src="cover.png"></main></body></html>'
    )

    const result = await runAccessibilityAssessment({
      bookDir,
      config: {
        run_only_tags: ["wcag2a", "cat.forms"],
        disabled_rules: [],
      },
    })

    expect(result.runOnlyTags).toEqual(["wcag2a", "cat.forms"])
    expect(result.disabledRules).toEqual([])
  })

  it("records a page error when manifest href escapes the ADT directory", async () => {
    const bookDir = path.join(tmpDir, "book")
    const contentDir = path.join(bookDir, "adt", "content")
    fs.mkdirSync(contentDir, { recursive: true })

    fs.writeFileSync(
      path.join(contentDir, "pages.json"),
      JSON.stringify([{ section_id: "pg001_sec001", href: "../escape.html", page_number: 1 }])
    )

    const result = await runAccessibilityAssessment({ bookDir })

    expect(result.summary.pagesWithErrors).toBe(1)
    expect(result.pages[0].error).toContain("outside the ADT directory")
  })

  it("does not report page-has-heading-one when a page-level h1 is present", async () => {
    const bookDir = path.join(tmpDir, "book")
    const adtDir = path.join(bookDir, "adt")
    const contentDir = path.join(adtDir, "content")
    fs.mkdirSync(contentDir, { recursive: true })

    fs.writeFileSync(
      path.join(contentDir, "pages.json"),
      JSON.stringify([{ section_id: "pg001_sec001", href: "index.html", page_number: 1 }])
    )

    fs.writeFileSync(
      path.join(adtDir, "index.html"),
      '<!doctype html><html lang="en"><head><title>Page One</title></head><body><main><h1 class="sr-only">Page One</h1><img src="cover.png" alt="Cover image"></main></body></html>'
    )

    const result = await runAccessibilityAssessment({ bookDir })

    expect(result.pages[0].violations.some((item) => item.id === "page-has-heading-one")).toBe(false)
  })

  it("does not report image-alt when single-image sections expose image_associated_text fallback", async () => {
    const bookDir = path.join(tmpDir, "book-associated-alt")
    const webAssetsDir = path.join(tmpDir, "assets-web")
    const imagesDir = path.join(bookDir, "images")
    fs.mkdirSync(bookDir, { recursive: true })
    fs.mkdirSync(imagesDir, { recursive: true })
    createWebAssets(webAssetsDir)
    fs.writeFileSync(path.join(imagesDir, "pg001_im001.png"), "pngdata")

    const pages: PageData[] = [{ pageId: "pg001", pageNumber: 1, text: "Page one" }]
    const storage = createMockStorage(pages, {
      "web-rendering": {
        pg001: {
          sections: [
            {
              sectionIndex: 0,
              sectionType: "content",
              reasoning: "ok",
              html: '<div id="content" class="container"><section role="article" data-section-type="content" data-section-id="pg001_sec001"><img data-id="pg001_im001" src="/api/books/book/images/pg001_im001"></section></div>',
            },
          ],
        },
      },
      "page-sectioning": {
        pg001: {
          reasoning: "ok",
          sections: [
            {
              sectionId: "pg001_sec001",
              sectionType: "content",
              nodes: [
                {
                  nodeId: "pg001_sec001_ig001",
                  isPruned: false,
                  structure: "image_group",
                  children: [
                    {
                      nodeId: "pg001_im001",
                      isPruned: false,
                      role: "image",
                    },
                    {
                      nodeId: "pg001_gp001_tx001",
                      isPruned: false,
                      role: "caption",
                      text: "A lifecycle diagram with six stages",
                    },
                  ],
                },
              ],
              backgroundColor: "#fff",
              textColor: "#000",
              pageNumber: 1,
              isPruned: false,
            },
          ],
        },
      },
    })

    await packageAdtWeb(storage, {
      bookDir,
      label: "book",
      language: "en",
      outputLanguages: ["en"],
      title: "Book Title",
      webAssetsDir,
    })

    const result = await runAccessibilityAssessment({ bookDir })
    const violationIds = result.pages[0].violations.map((item) => item.id)
    expect(violationIds).not.toContain("image-alt")
  })

  it("filters out axe-internal-error incomplete findings from JSDOM", async () => {
    const bookDir = path.join(tmpDir, "book-axe-errors")
    const adtDir = path.join(bookDir, "adt")
    const contentDir = path.join(adtDir, "content")
    fs.mkdirSync(contentDir, { recursive: true })

    fs.writeFileSync(
      path.join(contentDir, "pages.json"),
      JSON.stringify([{ section_id: "pg001_sec001", href: "index.html", page_number: 1 }])
    )

    // Valid page with <main> and <h1> — JSDOM may still report these rules as
    // incomplete with "Axe encountered an error" due to missing layout APIs.
    fs.writeFileSync(
      path.join(adtDir, "index.html"),
      '<!doctype html><html lang="en"><head><title>Page</title></head><body><main><h1>Title</h1><p>Content</p></main></body></html>'
    )

    const result = await runAccessibilityAssessment({ bookDir })

    // No incomplete findings should have the axe-internal-error pattern
    for (const page of result.pages) {
      for (const finding of page.incomplete) {
        expect(isAxeInternalError(finding)).toBe(false)
      }
    }
  })

  it("does not report missing main, missing h1, or image-alt for packaged output with fallback heading and caption-backed alt", async () => {
    const bookDir = path.join(tmpDir, "book-packaged")
    const webAssetsDir = path.join(tmpDir, "assets-web")
    const imagesDir = path.join(bookDir, "images")
    fs.mkdirSync(bookDir, { recursive: true })
    fs.mkdirSync(imagesDir, { recursive: true })
    createWebAssets(webAssetsDir)
    fs.writeFileSync(path.join(imagesDir, "pg001_im001.png"), "pngdata")

    const pages: PageData[] = [{ pageId: "pg001", pageNumber: 1, text: "Page one" }]
    const storage = createMockStorage(pages, {
      "web-rendering": {
        pg001: {
          sections: [
            {
              sectionIndex: 0,
              sectionType: "content",
              reasoning: "ok",
              html: '<div id="content" class="container"><section role="article" data-section-type="content" data-section-id="pg001_sec001"><p data-id="tx001">Hello world</p><img data-id="pg001_im001" src="/api/books/book/images/pg001_im001"></section></div>',
            },
          ],
        },
      },
      "page-sectioning": {
        pg001: {
          reasoning: "ok",
          sections: [
            {
              sectionId: "pg001_sec001",
              sectionType: "content",
              nodes: [
                {
                  nodeId: "pg001_gp001",
                  isPruned: false,
                  structure: "paragraph",
                  children: [
                    {
                      nodeId: "tx001",
                      isPruned: false,
                      role: "section_text",
                      text: "Hello world",
                    },
                  ],
                },
                {
                  nodeId: "pg001_sec001_ig001",
                  isPruned: false,
                  structure: "image_group",
                  children: [
                    {
                      nodeId: "pg001_im001",
                      isPruned: false,
                      role: "image",
                    },
                  ],
                },
              ],
              backgroundColor: "#fff",
              textColor: "#000",
              pageNumber: 1,
              isPruned: false,
            },
          ],
        },
      },
      "image-captioning": {
        pg001: {
          captions: [
            { imageId: "pg001_im001", reasoning: "r", caption: "A labeled diagram" },
          ],
        },
      },
    })

    await packageAdtWeb(storage, {
      bookDir,
      label: "book",
      language: "en",
      outputLanguages: ["en"],
      title: "Book Title",
      webAssetsDir,
    })

    const result = await runAccessibilityAssessment({ bookDir })
    const violationIds = result.pages[0].violations.map((item) => item.id)

    expect(violationIds).not.toContain("landmark-one-main")
    expect(violationIds).not.toContain("page-has-heading-one")
    expect(violationIds).not.toContain("aria-allowed-role")
    expect(violationIds).not.toContain("image-alt")
  })
})
