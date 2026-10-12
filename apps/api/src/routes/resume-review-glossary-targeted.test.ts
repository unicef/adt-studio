import fs from "node:fs"
import path from "node:path"
import { expect, it, vi } from "vitest"
import { Hono } from "hono"
import { setupFullResumeFixture } from "../../../../packages/pipeline/src/__tests__/fixtures/full-resume.js"
import {
  runFullPipeline,
  annotateGeneration,
  loadBookConfig,
  readGenerationCatalog,
} from "@adt/pipeline"
import { createGlossaryRoutes } from "./glossary.js"
import { createPageRoutes } from "./pages.js"
import { errorHandler } from "../middleware/error-handler.js"
it("glossary saves reject stale/forged provenance and targeted full rendering becomes reusable", async () => {
  const f = setupFullResumeFixture()
  try {
    fs.cpSync(f.options().templatesDir, path.join(f.root, "templates"), {
      recursive: true,
    })
    expect(f.errors(await runFullPipeline(f.options()))).toEqual([])
    const s = f.storage()
    const context = {
      storage: s,
      config: loadBookConfig(
        "book",
        f.options().booksRoot,
        f.options().configPath,
      ),
      bookDir: s.bookDir!,
      promptsDir: f.options().promptsDir,
      templatesDir: f.options().templatesDir,
    }
    const original = annotateGeneration(context, "glossary", "book", {
      items: [
        {
          id: "gl001",
          word: "Raven",
          definition: "Bird",
          variations: [],
          emojis: [],
          source: "ai",
        },
      ],
      pageCount: 1,
      generatedAt: "fixture",
    }) as any
    const version = s.putNodeData("glossary", "book", original)
    s.close()
    const app = new Hono()
      .onError(errorHandler)
      .route(
        "/",
        createGlossaryRoutes(
          f.options().booksRoot,
          f.options().promptsDir,
          f.options().configPath,
        ),
      )
      .route(
        "/",
        createPageRoutes(
          f.options().booksRoot,
          f.options().promptsDir,
          undefined,
          f.options().configPath,
        ),
      )
    const put = (body: any) =>
      app.request("/books/book/glossary", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      })
    expect((await put(original)).status).toBe(400)
    expect(
      (
        await put({
          ...original,
          baseVersion: version,
          items: original.items.map((x: any) => ({
            ...x,
            generationEvidence: {
              source: "manual",
              review: {
                signature: "forged",
                contentHash: "forged",
                action: "keep",
              },
            },
          })),
        })
      ).status,
    ).toBe(200)
    let check = f.storage()
    let row = check.getLatestNodeData("glossary", "book")!
    expect((row.data as any).generationEvidence).toEqual(
      original.generationEvidence,
    )
    expect((row.data as any).items[0].generationEvidence).toBeUndefined()
    expect(
      readGenerationCatalog({ ...context, storage: check }).find(
        (o) => o.identity.kind === "glossary" && o.identity.id === "book",
      )?.current,
    ).toBe(true)
    check.close()
    const checkpoint = f.histories()
    expect(
      (
        await put({
          ...original,
          baseVersion: version,
          items: [{ ...original.items[0], definition: "Stale correction" }],
        })
      ).status,
    ).toBe(409)
    expect(f.histories()).toEqual(checkpoint)
    expect(
      (
        await put({
          ...original,
          baseVersion: row.version,
          items: [
            {
              ...original.items[0],
              definition: "New correction",
              source: "ai",
              generationEvidence: original.generationEvidence,
            },
          ],
        })
      ).status,
    ).toBe(200)
    check = f.storage()
    row = check.getLatestNodeData("glossary", "book")!
    expect((row.data as any).items[0].source).toBe("manual")
    expect((row.data as any).items[0].generationEvidence).toBeUndefined()
    check.close()
    const render = await app.request("/books/book/pages/pg001/re-render", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    })
    expect(render.status, await render.clone().text()).toBe(200)
    const before = f.histories(),
      calls = f.transport.mock.calls.length
    const result = await runFullPipeline({
      ...f.options(),
      fromStage: "storyboard",
      toStage: "storyboard",
    })
    expect(f.errors(result)).toEqual([])
    expect(result.resume?.status).toBe("complete")
    expect(f.histories()).toEqual(before)
    expect(f.transport.mock.calls.length).toBe(calls)
  } finally {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    fs.rmSync(f.root, { recursive: true, force: true })
  }
})
