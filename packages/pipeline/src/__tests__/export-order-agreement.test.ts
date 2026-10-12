import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import type { PageData } from "@adt/storage"
import { packageAdtWeb } from "../packaging/web.js"
import { packageWebpub } from "../packaging/webpub.js"
import { packageEpub } from "../packaging/epub.js"
import { packagePnld } from "../packaging/pnld.js"
import { createMockStorage, createWebAssets } from "./helpers/mock-storage.js"

/**
 * Issue #660's headline acceptance criterion: "ADT, WebPub, EPUB, and PNLD
 * exports agree on the resulting sequence."
 *
 * Each format is covered on its own elsewhere. What is only checkable here is
 * that they agree *with each other*, because they do not share a code path:
 * `packageAdtWeb` resolves the reading order and writes `content/pages.json`,
 * and the other three re-derive their own structures from that file. A format
 * that reads it in the order it happens to hold, or sorts it again on its own
 * terms, produces a bundle whose spine and navigation disagree — which is how
 * the EPUB nav drifted from its own spine before this was pinned.
 *
 * The book below is deliberately reordered *and* contains a quiz, so a
 * consumer that fell back to source-page order would be caught.
 */

const PAGES: PageData[] = [
  { pageId: "pg001", pageNumber: 1, text: "Page one" },
  { pageId: "pg002", pageNumber: 2, text: "Page two" },
  { pageId: "pg003", pageNumber: 3, text: "Page three" },
]

/** The reader meets page three first, then two, then one. */
const STORED_ORDER = [
  { kind: "section", id: "pg003_sec001" },
  { kind: "section", id: "pg002_sec001" },
  { kind: "quiz", id: "qz001" },
  { kind: "section", id: "pg001_sec001" },
]

const EXPECTED_STEMS = ["pg003_sec001", "pg002_sec001", "qz001", "pg001_sec001"]

/** The same sequence minus the quiz, which the stored TOC has no entry for. */
const EXPECTED_TOC_STEMS = ["pg003_sec001", "pg002_sec001", "pg001_sec001"]

function section(pageId: string, pageNumber: number) {
  return {
    reasoning: "ok",
    sections: [
      {
        sectionId: `${pageId}_sec001`,
        sectionType: "content",
        nodes: [],
        backgroundColor: "#fff",
        textColor: "#000",
        pageNumber,
        isPruned: false,
      },
    ],
  }
}

function rendering(body: string) {
  return {
    sections: [{ sectionIndex: 0, sectionType: "content", reasoning: "", html: `<p>${body}</p>` }],
  }
}

function nodeData(storedOrder: unknown[] | null): Record<string, Record<string, unknown>> {
  const data: Record<string, Record<string, unknown>> = {
    "web-rendering": {
      pg001: rendering("One"),
      pg002: rendering("Two"),
      pg003: rendering("Three"),
    },
    "page-sectioning": {
      pg001: section("pg001", 1),
      pg002: section("pg002", 2),
      pg003: section("pg003", 3),
    },
    // Stored in *source* order, not reading order, and nested: this is what
    // the LLM (or the user's TOC editing) leaves behind, and a reorder never
    // rewrites it. Every nav consumer has to order it for itself, which is
    // exactly where the EPUB nav used to drift away from its own spine.
    "toc-generation": {
      book: {
        generatedAt: "2026-01-01T00:00:00.000Z",
        pageCount: 3,
        entries: [
          {
            id: "t1",
            title: "One",
            sectionId: "pg001_sec001",
            href: "pg001_sec001.html",
            chapterId: "c1",
            level: 1,
          },
          {
            id: "t2",
            title: "Two",
            sectionId: "pg002_sec001",
            href: "pg002_sec001.html",
            chapterId: "c2",
            level: 1,
          },
          {
            id: "t3",
            title: "Three",
            sectionId: "pg003_sec001",
            href: "pg003_sec001.html",
            chapterId: "c3",
            level: 1,
          },
        ],
      },
    },
    "quiz-generation": {
      book: {
        generatedAt: "2026-01-01T00:00:00.000Z",
        language: "en",
        pagesPerQuiz: 3,
        quizzes: [
          {
            quizId: "qz001",
            quizIndex: 0,
            afterPageId: "pg002",
            pageIds: ["pg002"],
            question: "Which page did you just read?",
            options: [
              { text: "Two", explanation: "" },
              { text: "Three", explanation: "" },
              { text: "One", explanation: "" },
            ],
            answerIndex: 0,
            reasoning: "",
          },
        ],
      },
    },
  }
  if (storedOrder) {
    data["reading-order"] = {
      book: {
        schemaVersion: 1,
        updatedAt: "2026-01-01T00:00:00.000Z",
        items: storedOrder,
      },
    }
  }
  return data
}

/** Strip directory and extension so one sequence can be compared across formats. */
function stems(hrefs: string[]): string[] {
  return hrefs.map((href) => path.basename(href.split(/[?#]/)[0]).replace(/\.(x?html)$/, ""))
}

function matchAll(xml: string, re: RegExp): string[] {
  return [...xml.matchAll(re)].map((m) => m[1])
}

/**
 * The OPF spine references manifest ids, so resolve each back to its href.
 * Shared by the EPUB and PNLD assertions, which build the same structure.
 */
function spineHrefs(opf: string): string[] {
  const hrefById = new Map(
    [...opf.matchAll(/<item\s+id="([^"]+)"\s+href="([^"]+)"/g)].map((m) => [m[1], m[2]] as const),
  )
  return matchAll(opf, /<itemref\s+idref="([^"]+)"/g).map((id) => hrefById.get(id) ?? id)
}

let tmpDir: string
let bookDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "adt-export-order-"))
  bookDir = path.join(tmpDir, "book")
  fs.mkdirSync(bookDir, { recursive: true })
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe("every export agrees on the reading order", () => {
  it("places the same sequence in the ADT, WebPub, EPUB and PNLD bundles", async () => {
    const webAssetsDir = path.join(tmpDir, "assets-web")
    createWebAssets(webAssetsDir)
    const storage = createMockStorage(PAGES, nodeData(STORED_ORDER))
    const options = {
      bookDir,
      label: "book",
      language: "en",
      outputLanguages: ["en"],
      title: "Book Title",
      webAssetsDir,
      features: { quizzes: true },
    }

    await packageAdtWeb(storage, options)
    packageWebpub(storage, options)
    packageEpub(storage, options)
    packagePnld(storage, options)

    // ── ADT ────────────────────────────────────────────────────────────
    const pagesJson = JSON.parse(
      fs.readFileSync(path.join(bookDir, "adt", "content", "pages.json"), "utf-8"),
    ) as Array<{ section_id: string; href: string }>
    expect(pagesJson.map((p) => p.section_id)).toEqual(EXPECTED_STEMS)
    expect(stems(pagesJson.map((p) => p.href))).toEqual(EXPECTED_STEMS)

    // ── WebPub ─────────────────────────────────────────────────────────
    const manifest = JSON.parse(
      fs.readFileSync(path.join(bookDir, "webpub", "manifest.json"), "utf-8"),
    ) as { readingOrder: Array<{ href: string }> }
    expect(stems(manifest.readingOrder.map((e) => e.href))).toEqual(EXPECTED_STEMS)

    // ── EPUB ───────────────────────────────────────────────────────────
    // EPUB keeps page documents at the OEBPS root; PNLD reorganizes them under
    // content/. Comparing stems rather than hrefs lets one expectation cover
    // both without asserting each format's internal layout.
    const oebps = path.join(bookDir, "epub", "OEBPS")
    const opf = fs.readFileSync(path.join(oebps, "content.opf"), "utf-8")
    expect(stems(spineHrefs(opf))).toEqual(EXPECTED_STEMS)

    // The nav document is built from the stored TOC, which has no quiz entry
    // and is stored in source order — so it covers fewer pages than the spine,
    // but the pages it does cover must appear in the same relative order.
    const nav = fs.readFileSync(path.join(oebps, "toc.xhtml"), "utf-8")
    expect(stems(matchAll(nav, /<a href="([^"]+)"/g))).toEqual(EXPECTED_TOC_STEMS)

    const ncx = fs.readFileSync(path.join(oebps, "toc.ncx"), "utf-8")
    expect(stems(matchAll(ncx, /<content src="([^"]+)"/g))).toEqual(EXPECTED_STEMS)
    // playOrder must increase monotonically or readers disagree with the spine.
    const playOrder = matchAll(ncx, /playOrder="(\d+)"/g).map(Number)
    expect(playOrder).toEqual([...playOrder].sort((a, b) => a - b))

    // ── PNLD ───────────────────────────────────────────────────────────
    const pnldDir = path.join(bookDir, "pnld")
    const pnldOpf = fs.readFileSync(path.join(pnldDir, "content.opf"), "utf-8")
    expect(stems(spineHrefs(pnldOpf))).toEqual(EXPECTED_STEMS)

    const pnldNav = fs.readFileSync(path.join(pnldDir, "index.html"), "utf-8")
    expect(stems(matchAll(pnldNav, /<a href="(content\/[^"]+)"/g))).toEqual(EXPECTED_TOC_STEMS)

    const pnldNcx = fs.readFileSync(path.join(pnldDir, "toc.ncx"), "utf-8")
    expect(stems(matchAll(pnldNcx, /<content src="(content\/[^"]+)"/g))).toEqual(EXPECTED_STEMS)
  })

  it("names the same files whichever order the book is in", async () => {
    // The order decides sequence, never naming: #660 requires that filenames
    // and stored assets are untouched by a reorder. Packaging the same book
    // twice — once with a stored order, once without — must therefore emit an
    // identical set of files, differing only in how they are sequenced.
    const webAssetsDir = path.join(tmpDir, "assets-web")
    createWebAssets(webAssetsDir)

    const filesFor = async (storedOrder: unknown[] | null) => {
      fs.rmSync(path.join(bookDir, "adt"), { recursive: true, force: true })
      await packageAdtWeb(createMockStorage(PAGES, nodeData(storedOrder)), {
        bookDir,
        label: "book",
        language: "en",
        outputLanguages: ["en"],
        title: "Book Title",
        webAssetsDir,
        features: { quizzes: true },
      })
      const contentDir = path.join(bookDir, "adt", "content")
      return fs.readdirSync(contentDir).sort()
    }

    const defaultOrder = await filesFor(null)
    const reordered = await filesFor(STORED_ORDER)
    expect(reordered).toEqual(defaultOrder)
  })

  it("keeps each page's source page_number through a reorder", async () => {
    const webAssetsDir = path.join(tmpDir, "assets-web")
    createWebAssets(webAssetsDir)

    await packageAdtWeb(createMockStorage(PAGES, nodeData(STORED_ORDER)), {
      bookDir,
      label: "book",
      language: "en",
      outputLanguages: ["en"],
      title: "Book Title",
      webAssetsDir,
      features: { quizzes: true },
    })

    const pagesJson = JSON.parse(
      fs.readFileSync(path.join(bookDir, "adt", "content", "pages.json"), "utf-8"),
    ) as Array<{ section_id: string; page_number?: number }>

    // Reading position 1 is source page 3, and so on — provenance survives.
    expect(pagesJson.map((p) => [p.section_id, p.page_number])).toEqual([
      ["pg003_sec001", 3],
      ["pg002_sec001", 2],
      ["qz001", undefined],
      ["pg001_sec001", 1],
    ])
  })
})
