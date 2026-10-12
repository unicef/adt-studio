import fs from "node:fs"
import path from "node:path"
import { expect, it, vi } from "vitest"
import { Hono } from "hono"
import { setupFullResumeFixture } from "../../../../packages/pipeline/src/__tests__/fixtures/full-resume.js"
import {
  runFullPipeline,
  readGenerationCatalog,
  loadBookConfig,
} from "@adt/pipeline"
import { createOutputRoutes } from "./outputs.js"
import { errorHandler } from "../middleware/error-handler.js"
it("same-content new version rejects stale replacement and batch Keep validates shared owner atomically", async () => {
  const f = setupFullResumeFixture()
  try {
    fs.cpSync(f.options().templatesDir, path.join(f.root, "templates"), {
      recursive: true,
    })
    expect(f.errors(await runFullPipeline(f.options()))).toEqual([])
    let s = f.storage()
    const readExtract = () =>
      readGenerationCatalog({
        kinds: ["extract-generation"],
        storage: s,
        config: loadBookConfig(
          "book",
          f.options().booksRoot,
          f.options().configPath,
        ),
        bookDir: s.bookDir!,
        promptsDir: f.options().promptsDir,
        templatesDir: f.options().templatesDir,
      })[0]
    const extractionBefore = readExtract()
    const classification = s.getLatestNodeData("image-filtering", "pg001")!.data
    s.putNodeData("image-filtering", "pg001", classification)
    const extractionAfter = readExtract()
    expect(extractionAfter.signature).toBe(extractionBefore.signature)
    expect(extractionAfter.contentHash).toBe(extractionBefore.contentHash)
    expect(extractionAfter.revision).not.toBe(extractionBefore.revision)
    const html = s.getLatestNodeData("web-rendering", "pg001")!.data as any
    const manual = { ...html, source: "manual" }
    s.putNodeData("web-rendering", "pg001", manual)
    const captured = readGenerationCatalog({
      storage: s,
      config: loadBookConfig(
        "book",
        f.options().booksRoot,
        f.options().configPath,
      ),
      bookDir: s.bookDir!,
      promptsDir: f.options().promptsDir,
      templatesDir: f.options().templatesDir,
    }).find((o) => o.identity.kind === "storyboard")!
    s.putNodeData("web-rendering", "pg001", manual)
    s.close()
    const before = f.histories(),
      calls = f.transport.mock.calls.length
    const r = await runFullPipeline({
      ...f.options(),
      fromStage: "storyboard",
      toStage: "storyboard",
      outputScope: {
        replace: [
          {
            identity: captured.identity,
            signature: captured.signature,
            contentHash: captured.contentHash,
            revision: captured.revision,
          },
        ],
      },
    })
    expect(f.errors(r).join()).toContain("changed since review")
    expect(f.histories()).toEqual(before)
    expect(f.transport.mock.calls.length).toBe(calls)
    s = f.storage()
    s.putNodeData("glossary", "book", {
      items: [
        {
          id: "gl001",
          word: "Raven",
          definition: "Bird",
          variations: [],
          emojis: [],
          source: "manual",
        },
        {
          id: "gl002",
          word: "Cat",
          definition: "Animal",
          variations: [],
          emojis: [],
        },
      ],
      pageCount: 1,
      generatedAt: "fixture",
    })
    s.close()
    const app = new Hono()
      .onError(errorHandler)
      .route(
        "/",
        createOutputRoutes(
          f.options().booksRoot,
          f.options().promptsDir,
          f.options().configPath,
        ),
      )
    const list = await (await app.request("/books/book/outputs")).json()
    const items = list.outputs.filter(
      (o: any) => o.identity.kind === "glossary" && o.identity.id !== "book",
    )
    expect(items).toHaveLength(2)
    const reviews = items.map((o: any) => ({
      identity: o.identity,
      signature: o.signature,
      contentHash: o.contentHash,
      revision: o.revision,
      action: "keep",
    }))
    const checkpoint = f.histories()
    const post = (reviews: any) =>
      app.request("/books/book/outputs/review", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reviews }),
      })
    expect(
      (await post([reviews[0], { ...reviews[1], revision: "stale" }])).status,
    ).toBe(409)
    expect(f.histories()).toEqual(checkpoint)
    const accepted = await post(reviews)
    expect(accepted.status, await accepted.clone().text()).toBe(200)
    const after = await (await app.request("/books/book/outputs")).json()
    expect(
      after.outputs
        .filter(
          (o: any) =>
            o.identity.kind === "glossary" && o.identity.id !== "book",
        )
        .every((o: any) => o.current && o.protected),
    ).toBe(true)
    s = f.storage()
    const saved = s.getLatestNodeData("glossary", "book")!.data as any
    expect(saved.items[0].source).toBe("manual")
    expect(saved.items[1].source).toBeUndefined()
    s.close()
  } finally {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    fs.rmSync(f.root, { recursive: true, force: true })
  }
})
