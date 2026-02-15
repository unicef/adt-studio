/**
 * Integration test for the full pipeline against raven.pdf (pages 1-3).
 *
 * Uses pre-populated LLM cache fixtures for fast, reproducible runs.
 *
 * To regenerate the cache:
 *   1. Delete the fixtures/raven-cache/ directory contents
 *   2. Set OPENAI_API_KEY in your environment
 *   3. Run: pnpm test packages/pipeline/src/__tests__/pipeline-integration.test.ts
 *   4. Commit the new cache files in fixtures/raven-cache/
 *
 * When the cache exists, the test runs with no API calls.
 * When the cache is missing and no API key is set, the test fails with instructions.
 */
import { describe, it, expect, afterEach } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import {
  BookMetadata,
  TextClassificationOutput,
  ImageClassificationOutput,
  PageSectioningOutput,
  WebRenderingOutput,
  GlossaryOutput,
  QuizGenerationOutput,
} from "@adt/types"
import { resolveBookPaths, openBookDb, createBookStorage } from "@adt/storage"
import { runPipeline } from "../pipeline.js"
import { runProof } from "../proof.js"

const REPO_ROOT = path.resolve(import.meta.dirname, "../../../..")
const RAVEN_PDF = path.join(REPO_ROOT, "assets/raven.pdf")
const CONFIG_PATH = path.join(REPO_ROOT, "config.yaml")
const PROMPTS_DIR = path.join(REPO_ROOT, "prompts")
const TEMPLATES_DIR = path.join(REPO_ROOT, "templates")
const FIXTURE_CACHE_DIR = path.resolve(
  import.meta.dirname,
  "fixtures/raven-cache"
)

const cacheExists =
  fs.existsSync(FIXTURE_CACHE_DIR) &&
  fs.readdirSync(FIXTURE_CACHE_DIR).some((f) => f.endsWith(".json"))
const hasApiKey = !!process.env.OPENAI_API_KEY

const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
  dirs.length = 0
})

describe("pipeline integration (raven.pdf, pages 1-3)", () => {
  it(
    "runs full pipeline and produces expected outputs",
    { timeout: 120_000 },
    async () => {
      if (!cacheExists && !hasApiKey) {
        expect.fail(
          "LLM cache fixtures not found and OPENAI_API_KEY is not set.\n" +
            "To populate the cache:\n" +
            "  1. Set OPENAI_API_KEY in your environment\n" +
            "  2. Run: pnpm test packages/pipeline/src/__tests__/pipeline-integration.test.ts\n" +
            "  3. Commit the new cache files in fixtures/raven-cache/"
        )
      }

      const booksRoot = fs.mkdtempSync(
        path.join(os.tmpdir(), "adt-pipeline-integ-")
      )
      dirs.push(booksRoot)
      const label = "test_raven"

      await runPipeline({
        label,
        pdfPath: RAVEN_PDF,
        booksRoot,
        startPage: 1,
        endPage: 3,
        concurrency: 3,
        configPath: CONFIG_PATH,
        promptsDir: PROMPTS_DIR,
        templatesDir: TEMPLATES_DIR,
        cacheDir: FIXTURE_CACHE_DIR,
      })

      // Open DB for assertions
      const paths = resolveBookPaths(label, booksRoot)
      const db = openBookDb(paths.dbPath)

      try {
        // --- Pages ---
        const pageRows = db.all(
          "SELECT page_id, page_number FROM pages ORDER BY page_number"
        ) as Array<{ page_id: string; page_number: number }>
        expect(pageRows).toHaveLength(3)
        expect(pageRows.map((r) => r.page_id)).toEqual([
          "pg001",
          "pg002",
          "pg003",
        ])

        // --- Images on disk ---
        const imageRows = db.all(
          "SELECT image_id FROM images"
        ) as Array<{ image_id: string }>
        expect(imageRows.length).toBeGreaterThanOrEqual(3)
        for (const row of imageRows) {
          const imgPath = path.join(paths.imagesDir, `${row.image_id}.png`)
          expect(fs.existsSync(imgPath)).toBe(true)
        }

        // --- Metadata ---
        const metaRows = db.all(
          "SELECT data FROM node_data WHERE node = 'metadata' AND item_id = 'book' ORDER BY version DESC LIMIT 1"
        ) as Array<{ data: string }>
        expect(metaRows.length).toBeGreaterThanOrEqual(1)
        const metadata = BookMetadata.parse(JSON.parse(metaRows[0].data))
        expect(metadata.title).toBeTruthy()

        // --- Per-page pipeline outputs ---
        for (const pageId of ["pg001", "pg002", "pg003"]) {
          // Text classification
          const tcRows = db.all(
            "SELECT data FROM node_data WHERE node = 'text-classification' AND item_id = ? ORDER BY version DESC LIMIT 1",
            [pageId]
          ) as Array<{ data: string }>
          expect(tcRows).toHaveLength(1)
          const tc = TextClassificationOutput.parse(
            JSON.parse(tcRows[0].data)
          )
          expect(tc.groups.length).toBeGreaterThan(0)

          // Image classification
          const icRows = db.all(
            "SELECT data FROM node_data WHERE node = 'image-classification' AND item_id = ? ORDER BY version DESC LIMIT 1",
            [pageId]
          ) as Array<{ data: string }>
          expect(icRows).toHaveLength(1)
          ImageClassificationOutput.parse(JSON.parse(icRows[0].data))

          // Page sectioning
          const psRows = db.all(
            "SELECT data FROM node_data WHERE node = 'page-sectioning' AND item_id = ? ORDER BY version DESC LIMIT 1",
            [pageId]
          ) as Array<{ data: string }>
          expect(psRows).toHaveLength(1)
          const ps = PageSectioningOutput.parse(JSON.parse(psRows[0].data))
          expect(ps.sections.length).toBeGreaterThan(0)

          // Web rendering
          const wrRows = db.all(
            "SELECT data FROM node_data WHERE node = 'web-rendering' AND item_id = ? ORDER BY version DESC LIMIT 1",
            [pageId]
          ) as Array<{ data: string }>
          expect(wrRows).toHaveLength(1)
          const wr = WebRenderingOutput.parse(JSON.parse(wrRows[0].data))
          expect(wr.sections.length).toBeGreaterThan(0)
          for (const section of wr.sections) {
            expect(section.html).toBeTruthy()
          }
        }
      } finally {
        db.close()
      }

      // --- Proof Stage ---
      // Accept storyboard (required before proof can run)
      const storage = createBookStorage(label, booksRoot)
      try {
        storage.putNodeData("storyboard-acceptance", "book", {
          acceptedAt: new Date().toISOString(),
          renderedPageCount: 3,
        })
      } finally {
        storage.close()
      }

      await runProof({
        label,
        booksRoot,
        promptsDir: PROMPTS_DIR,
        configPath: CONFIG_PATH,
        cacheDir: FIXTURE_CACHE_DIR,
      })

      // Re-open DB for proof assertions
      const db2 = openBookDb(paths.dbPath)
      try {
        // --- Image captioning ---
        for (const pageId of ["pg001", "pg002", "pg003"]) {
          const captionRows = db2.all(
            "SELECT data FROM node_data WHERE node = 'image-captioning' AND item_id = ? ORDER BY version DESC LIMIT 1",
            [pageId]
          ) as Array<{ data: string }>
          expect(captionRows).toHaveLength(1)
          const captions = JSON.parse(captionRows[0].data)
          expect(captions).toHaveProperty("captions")
        }

        // --- Glossary ---
        const glossaryRows = db2.all(
          "SELECT data FROM node_data WHERE node = 'glossary' AND item_id = 'book' ORDER BY version DESC LIMIT 1"
        ) as Array<{ data: string }>
        expect(glossaryRows).toHaveLength(1)
        const glossary = GlossaryOutput.parse(JSON.parse(glossaryRows[0].data))
        expect(glossary.items.length).toBeGreaterThan(0)

        // --- Quiz generation ---
        const quizRows = db2.all(
          "SELECT data FROM node_data WHERE node = 'quiz-generation' AND item_id = 'book' ORDER BY version DESC LIMIT 1"
        ) as Array<{ data: string }>
        expect(quizRows).toHaveLength(1)
        const quizOutput = QuizGenerationOutput.parse(
          JSON.parse(quizRows[0].data)
        )
        expect(quizOutput.quizzes.length).toBeGreaterThan(0)
      } finally {
        db2.close()
      }
    }
  )
})
