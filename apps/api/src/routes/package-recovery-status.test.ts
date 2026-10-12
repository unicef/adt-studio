import fs from "node:fs"
import path from "node:path"
import { expect, it, vi } from "vitest"
import { Hono } from "hono"
import { runFullPipeline, storyboardPackageComplete } from "@adt/pipeline"
import { PageSectioningOutput } from "@adt/types"
import { setupFullResumeFixture } from "../../../../packages/pipeline/src/__tests__/fixtures/full-resume.js"
import { createPackageRoutes } from "./package.js"
import { createBookRoutes } from "./books.js"
import { bookWriterMiddleware } from "../middleware/book-writer.js"
import { errorHandler } from "../middleware/error-handler.js"

it("package status and library cannot certify an interrupted publication or a directory in place of HTML", async () => {
  const fixture = setupFullResumeFixture()
  try {
    expect(fixture.errors(await runFullPipeline(fixture.options()))).toEqual([])
    const storage = fixture.storage()
    const bookDir = storage.bookDir!
    const sectionId = PageSectioningOutput.parse(
      storage.getLatestNodeData("page-sectioning", "pg001")!.data,
    ).sections[0].sectionId
    const html = path.join(bookDir, "adt", `${sectionId}.html`)
    fs.mkdirSync(path.join(bookDir, "adt/content"), { recursive: true })
    fs.writeFileSync(
      path.join(bookDir, "adt/content/pages.json"),
      JSON.stringify([{ section_id: sectionId, href: `${sectionId}.html` }]),
    )
    fs.writeFileSync(html, "<section>Existing complete output</section>")
    const app = new Hono()
      .onError(errorHandler)
      .use("/books/:label/*", bookWriterMiddleware(fixture.options().booksRoot))
      .route(
        "/",
        createPackageRoutes(
          fixture.options().booksRoot,
          path.join(fixture.root, "assets"),
          fixture.options().configPath,
        ),
      )
      .route(
        "/",
        createBookRoutes(
          fixture.options().booksRoot,
          undefined,
          fixture.options().configPath,
        ),
      )
    try {
      expect(
        await (await app.request("/books/book/package-adt/status")).json(),
      ).toMatchObject({ hasAdt: true, complete: true })
      const before = fixture.histories()
      const journal = path.join(bookDir, ".package-publication.json")
      const record = JSON.stringify({
        version: 1,
        attemptId: "e304cc6d-6fca-4f74-af1a-cf4b1614431f",
      })
      fs.writeFileSync(journal, record)
      const response = await app.request("/books/book/package-adt/status")
      expect(response.status).toBe(409)
      expect(await response.json()).toMatchObject({ code: "BOOK_BUSY" })
      expect(storyboardPackageComplete(storage, bookDir, ["pg001"])).toBe(false)
      expect(
        (await (await app.request("/books")).json())[0].completedStages,
      ).not.toContain("preview")
      expect(fixture.histories()).toEqual(before)
      expect(fs.readFileSync(journal, "utf8")).toBe(record)
      // A filesystem entry is not sufficient proof of a required regular file.
      fs.unlinkSync(journal)
      fs.unlinkSync(html)
      fs.mkdirSync(html)
      expect(
        await (await app.request("/books/book/package-adt/status")).json(),
      ).toMatchObject({ hasAdt: true, complete: false })
    } finally {
      storage.close()
    }
  } finally {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    fs.rmSync(fixture.root, { recursive: true, force: true })
  }
})
