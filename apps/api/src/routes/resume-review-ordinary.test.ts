import fs from "node:fs"
import path from "node:path"
import { expect, it, vi } from "vitest"
import { setupFullResumeFixture } from "../../../../packages/pipeline/src/__tests__/fixtures/full-resume.js"
import { runFullPipeline } from "@adt/pipeline"
import { createStageRunner } from "@adt/pipeline/stage-execution"
import { createStageRoutes } from "./stages.js"
import { createStageService } from "../services/stage-service.js"
import { createBookEventBus } from "../services/book-event-bus.js"
import { createPageErrorDecisions } from "../services/page-error-decisions.js"
import { errorHandler } from "../middleware/error-handler.js"
it(
  "ordinary HTTP stage run keeps protected storyboard without exact replacement",
  { timeout: 60000 },
  async () => {
    const f = setupFullResumeFixture()
    try {
      const { Hono } = await import("hono")
      fs.cpSync(f.options().templatesDir, path.join(f.root, "templates"), {
        recursive: true,
      })
      expect(f.errors(await runFullPipeline(f.options()))).toEqual([])
      const s = f.storage()
      const row = s.getLatestNodeData("web-rendering", "pg001")!.data as any
      const manual = {
        ...row,
        source: "manual",
        sections: row.sections.map((x: any) => ({
          ...x,
          html: x.html.replace("A raven visits.", "My manual text."),
        })),
      }
      s.putNodeData("web-rendering", "pg001", manual)
      s.close()
      const bus = createBookEventBus(),
        decisions = createPageErrorDecisions(bus),
        service = createStageService(createStageRunner(), bus, decisions),
        app = new Hono()
      app.onError(errorHandler)
      app.route(
        "/",
        createStageRoutes(
          service,
          bus,
          decisions,
          f.options().booksRoot,
          f.options().promptsDir,
          path.join(f.root, "assets"),
          f.options().configPath,
        ),
      )
      const response = await app.request("/books/book/stages/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromStage: "storyboard",
          toStage: "storyboard",
        }),
      })
      expect(response.status).toBe(200)
      await vi.waitFor(
        () => {
          const status = service.getStatus("book")
          expect(status.active?.status === "running").toBe(false)
        },
        { timeout: 20000 },
      )
      const verify = f.storage()
      const after = verify.getLatestNodeData("web-rendering", "pg001")!.data
      verify.close()
      expect(after).toEqual(manual)
      expect(service.getStatus("book").summary?.extraction).toBe(
        "not-requested",
      )
      expect(service.getStatus("book").summary?.status).toBe("incomplete")
    } finally {
      vi.unstubAllGlobals()
      vi.unstubAllEnvs()
      fs.rmSync(f.root, { recursive: true, force: true })
    }
  },
)
