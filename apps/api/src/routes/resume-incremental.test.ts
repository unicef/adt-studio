import fs from "node:fs"
import path from "node:path"
import { Hono } from "hono"
import { expect, it, vi } from "vitest"
import { runFullPipeline } from "@adt/pipeline"
import { WebRenderingOutput } from "@adt/types"
import { setupFullResumeFixture } from "../../../../packages/pipeline/src/__tests__/fixtures/full-resume.js"
import { createPageRoutes } from "./pages.js"
import { errorHandler } from "../middleware/error-handler.js"
it.each(["success", "failure", "cancel"] as const)(
  "fresh full DAG publishes a readable first page before a slow second page: %s",
  { timeout: 60000 },
  async (outcome) => {
    const fixture = setupFullResumeFixture()
    let release: (() => void) | undefined
    let waiting = false
    const controller = new AbortController()
    try {
      const options = fixture.options()
      fs.writeFileSync(
        options.configPath,
        fs
          .readFileSync(options.configPath, "utf8")
          .replace("end_page: 1", "end_page: 2")
          .replace("render_type: template", "render_type: llm")
          .replace(
            "config: { template: one_column_render }",
            "config: { prompt: acceptance_render, max_retries: 0, visual_refinement: { enabled: false } }",
          ),
      )
      fs.writeFileSync(
        path.join(options.promptsDir, "acceptance_render.liquid"),
        '{% chat role: "user" %}RENDER|{{ section_id }}\n{% for leaf in leaf_texts %}LEAF|{{ leaf.text_id }}|{{ leaf.text }}\n{% endfor %}{% endchat %}',
      )
      const original = fixture.transport.getMockImplementation()!
      let renderingRequests = 0
      fixture.transport.mockImplementation(async (url, init) => {
        const request = JSON.stringify(JSON.parse(String(init?.body)).messages)
        if (!request.includes("RENDER|")) return original(url, init)
        renderingRequests++
        const sectionId = request.match(/RENDER\|([^\\"\s]+)/)![1]
        if (sectionId.startsWith("pg002")) {
          waiting = true
          await new Promise<void>((resolve) => {
            release = resolve
          })
          if (outcome === "cancel") controller.abort()
          if (outcome === "failure")
            return new Response("Unavailable", { status: 400 })
        }
        const leaves = [...request.matchAll(/LEAF\|([^|]+)\|([^\\"]+)/g)]
        const content = `<section data-section-id="${sectionId}" data-section-type="text_only">${leaves.map(([, id, text]) => `<p data-id="${id}" class="adt-body">${text}</p>`).join("")}</section>`
        return Response.json({
          id: "fixture",
          object: "chat.completion",
          created: 0,
          model: "fixture",
          choices: [
            {
              index: 0,
              message: {
                role: "assistant",
                content: JSON.stringify({ reasoning: "Fixture", content }),
              },
              finish_reason: "stop",
            },
          ],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        })
      })
      const running = runFullPipeline({ ...options, signal: controller.signal })
      let published: unknown
      try {
        await vi.waitFor(() => expect(waiting).toBe(true), { timeout: 20000 })
        const app = new Hono()
          .onError(errorHandler)
          .route(
            "/",
            createPageRoutes(
              options.booksRoot,
              options.promptsDir,
              undefined,
              options.configPath,
            ),
          )
        const response = await app.request("/books/book/pages")
        expect(response.status).toBe(200)
        const pages = await response.json()
        expect(
          pages.find((page: { pageId: string }) => page.pageId === "pg001"),
        ).toMatchObject({ hasRendering: true })
        const storage = fixture.storage()
        try {
          published = storage.getLatestNodeData("web-rendering", "pg001")
          expect(
            WebRenderingOutput.parse(
              (
                published as {
                  data: unknown
                }
              ).data,
            ).sections[0].html,
          ).toContain("A raven visits.")
          expect(storage.getLatestNodeData("web-rendering", "pg002")).toBeNull()
        } finally {
          storage.close()
        }
      } finally {
        release?.()
        await running
      }
      const result = await running
      expect(renderingRequests).toBe(2)
      expect(result.resume?.status).toBe(
        outcome === "success"
          ? "complete"
          : outcome === "cancel"
            ? "cancelled"
            : "failed",
      )
      const verify = fixture.storage()
      try {
        expect(verify.getLatestNodeData("web-rendering", "pg001")).toEqual(
          published,
        )
        expect(
          verify.getAllNodeVersions("web-rendering", "pg001"),
        ).toHaveLength(1)
        if (outcome !== "success")
          expect(verify.getLatestNodeData("web-rendering", "pg002")).toBeNull()
      } finally {
        verify.close()
      }
    } finally {
      release?.()
      vi.unstubAllGlobals()
      vi.unstubAllEnvs()
      fs.rmSync(fixture.root, { recursive: true, force: true })
    }
  },
)
