import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import { Hono } from "hono"
import { createBookStorage } from "@adt/storage"
import { errorHandler } from "../middleware/error-handler.js"
import { createPageRoutes } from "./pages.js"

describe("Page routes", () => {
  let tmpDir: string
  let app: Hono
  const label = "test-book"

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pages-routes-"))

    // Create a book with extracted pages and pipeline data
    const storage = createBookStorage(label, tmpDir)
    try {
      // Simulate extracted pages
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
        images: [],
      })

      const fakeImage2 = {
        imageId: `${label}_p2_page`,
        buffer: Buffer.from("fake-png-data-2"),
        format: "png" as const,
        hash: "def456",
        width: 800,
        height: 600,
      }
      storage.putExtractedPage({
        pageId: `${label}_p2`,
        pageNumber: 2,
        text: "Page two text content",
        pageImage: fakeImage2,
        images: [],
      })

      // Simulate pipeline output for page 1
      storage.putNodeData("image-filtering", `${label}_p1`, {
        images: [],
      })
      storage.putNodeData("page-sectioning", `${label}_p1`, {
        reasoning: "sectioned",
        sections: [
          {
            sectionId: `${label}_p1_sec001`,
            sectionType: "content",
            backgroundColor: "#ffffff",
            textColor: "#000000",
            pageNumber: 1,
            isPruned: false,
            nodes: [
              {
                nodeId: `${label}_p1_n001`,
                isPruned: false,
                role: "text",
                text: "Hello world",
              },
            ],
          },
        ],
      })
      storage.putNodeData("web-rendering", `${label}_p1`, {
        sections: [
          {
            sectionIndex: 0,
            sectionType: "content",
            reasoning: "rendered",
            html: "<div>Hello world</div>",
          },
        ],
      })
    } finally {
      storage.close()
    }

    const routes = createPageRoutes(tmpDir, tmpDir)
    app = new Hono()
    app.onError(errorHandler)
    app.route("/api", routes)
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  describe("GET /api/books/:label/pages", () => {
    it("returns list of pages", async () => {
      const res = await app.request(`/api/books/${label}/pages`)

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toHaveLength(2)
      expect(body[0].pageId).toBe(`${label}_p1`)
      expect(body[0].pageNumber).toBe(1)
      expect(body[0].hasRendering).toBe(true)
      expect(body[0].textPreview).toBe("Hello world")
      expect(body[1].pageId).toBe(`${label}_p2`)
      expect(body[1].pageNumber).toBe(2)
      expect(body[1].hasRendering).toBe(false)
    })

    it("returns 404 for nonexistent book", async () => {
      const res = await app.request("/api/books/no-such-book/pages")
      expect(res.status).toBe(404)
    })
  })

  describe("GET /api/books/:label/pages/:pageId", () => {
    it("returns full page data with pipeline outputs", async () => {
      const res = await app.request(
        `/api/books/${label}/pages/${label}_p1`
      )

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.pageId).toBe(`${label}_p1`)
      expect(body.pageNumber).toBe(1)
      expect(body.text).toBe("Page one text content")
      expect(body.imageClassification).toBeTruthy()
      expect(body.sectioningTree).toBeTruthy()
      expect(body.sectioningTree.sections).toHaveLength(1)
      expect(body.sectioningTree.sections[0].nodes).toHaveLength(1)
      expect(body.sectioningTree.sections[0].nodes[0].role).toBe("text")
      expect(body.sectioningTree.sections[0].nodes[0].text).toBe("Hello world")
      expect(body.rendering).toBeTruthy()
      expect(body.rendering.sections[0].html).toBe(
        "<div>Hello world</div>"
      )
    })

    it("returns page without pipeline data if not processed", async () => {
      const res = await app.request(
        `/api/books/${label}/pages/${label}_p2`
      )

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.pageId).toBe(`${label}_p2`)
      expect(body.sectioningTree).toBeNull()
      expect(body.rendering).toBeNull()
    })

    it("returns 404 for nonexistent page", async () => {
      const res = await app.request(
        `/api/books/${label}/pages/fake-page`
      )
      expect(res.status).toBe(404)
    })
  })

  describe("GET /api/books/:label/pages/:pageId/image", () => {
    it("returns page image as base64 JSON", async () => {
      const res = await app.request(
        `/api/books/${label}/pages/${label}_p1/image`
      )

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.imageBase64).toBeTruthy()
      expect(typeof body.imageBase64).toBe("string")
    })

    it("returns 404 for nonexistent page image", async () => {
      const res = await app.request(
        `/api/books/${label}/pages/fake-page/image`
      )
      expect(res.status).toBe(404)
    })
  })

  describe("PUT /api/books/:label/pages/:pageId/sectioning", () => {
    it("saves page sectioning and returns version", async () => {
      const data = {
        reasoning: "updated reasoning",
        sections: [
          {
            sectionId: `${label}_p1_sec001`,
            sectionType: "content",
            backgroundColor: "#ffffff",
            textColor: "#000000",
            pageNumber: 1,
            isPruned: false,
            nodes: [
              {
                nodeId: `${label}_p1_g001`,
                isPruned: false,
                structure: "paragraph",
                children: [
                  {
                    nodeId: `${label}_p1_n001`,
                    isPruned: false,
                    role: "text",
                    text: "Updated text",
                  },
                ],
              },
            ],
          },
        ],
      }

      const res = await app.request(
        `/api/books/${label}/pages/${label}_p1/sectioning`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        }
      )

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.version).toBe(2) // version 1 was set in beforeEach
    })

    it("returns 400 for invalid body", async () => {
      const res = await app.request(
        `/api/books/${label}/pages/${label}_p1/sectioning`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bad: "data" }),
        }
      )

      expect(res.status).toBe(400)
    })

    it("returns 404 for nonexistent page", async () => {
      const data = {
        reasoning: "test",
        sections: [],
      }

      const res = await app.request(
        `/api/books/${label}/pages/fake-page/sectioning`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        }
      )

      expect(res.status).toBe(404)
    })

    it("marks the storyboard chain as needing a re-run, keeping node data", async () => {
      // A sectioning edit invalidates the rendered HTML that every later stage
      // is derived from, so those stages must stop reporting "done" — but their
      // data (and version history) must survive.
      const seed = createBookStorage(label, tmpDir)
      try {
        seed.markStepCompleted("web-rendering")
        seed.markStepCompleted("quiz-generation")
        seed.markStepCompleted("toc-generation")
        seed.putNodeData("web-rendering", `${label}_p1`, { sections: [] })
      } finally {
        seed.close()
      }

      const res = await app.request(
        `/api/books/${label}/pages/${label}_p1/sectioning`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reasoning: "r", sections: [] }),
        }
      )
      expect(res.status).toBe(200)

      const after = createBookStorage(label, tmpDir)
      try {
        const steps = after.getStepRuns().map((r) => r.step)
        expect(steps).not.toContain("web-rendering")
        expect(steps).not.toContain("quiz-generation")
        expect(steps).not.toContain("toc-generation")
        // Non-destructive: the rendering itself is untouched.
        expect(after.getLatestNodeData("web-rendering", `${label}_p1`)).toBeTruthy()
      } finally {
        after.close()
      }
    })

    it("rejects sectioning changes while a pipeline step is running", async () => {
      const seed = createBookStorage(label, tmpDir)
      try {
        seed.markStepStarted("web-rendering")
      } finally {
        seed.close()
      }

      const res = await app.request(
        `/api/books/${label}/pages/${label}_p1/sectioning`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reasoning: "r", sections: [] }),
        }
      )
      expect(res.status).toBe(409)

      const after = createBookStorage(label, tmpDir)
      try {
        expect(
          after.getLatestNodeData("page-sectioning", `${label}_p1`)?.version
        ).toBe(1)
        expect(after.getStepRuns()).toContainEqual(
          expect.objectContaining({ step: "web-rendering", status: "running" })
        )
      } finally {
        after.close()
      }
    })

    it("does not mark storyboard stale when only the rendering is saved", async () => {
      const seed = createBookStorage(label, tmpDir)
      try {
        seed.markStepCompleted("web-rendering")
      } finally {
        seed.close()
      }

      const res = await app.request(
        `/api/books/${label}/pages/${label}_p1/rendering`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sections: [] }),
        }
      )
      expect(res.status).toBe(200)

      const after = createBookStorage(label, tmpDir)
      try {
        // Saving the storyboard's own output must not invalidate itself.
        expect(after.getStepRuns().map((r) => r.step)).toContain("web-rendering")
      } finally {
        after.close()
      }
    })
  })

  describe("PUT /api/books/:label/pages/:pageId/image-filtering", () => {
    it("saves image classification and returns version", async () => {
      const data = {
        images: [
          { imageId: "img1", isPruned: false, reason: "kept" },
        ],
      }

      const res = await app.request(
        `/api/books/${label}/pages/${label}_p1/image-filtering`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        }
      )

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.version).toBe(2) // version 1 was set in beforeEach
    })

    it("returns 400 for invalid body", async () => {
      const res = await app.request(
        `/api/books/${label}/pages/${label}_p1/image-filtering`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bad: "data" }),
        }
      )

      expect(res.status).toBe(400)
    })
  })

  describe("POST /api/books/:label/pages/:pageId/sections/:sectionIndex/clone", () => {
    it("assigns fresh ids to cloned containers but preserves leaf ids", async () => {
      const sourceContainerId = `${label}_p1_n0001`
      const sourceLeafId = `${label}_p1_n0002`

      const storage = createBookStorage(label, tmpDir)
      try {
        storage.putNodeData("page-sectioning", `${label}_p1`, {
          reasoning: "nested",
          sections: [
            {
              sectionId: `${label}_p1_sec001`,
              sectionType: "content",
              backgroundColor: "#ffffff",
              textColor: "#000000",
              pageNumber: 1,
              isPruned: false,
              nodes: [
                {
                  nodeId: sourceContainerId,
                  isPruned: false,
                  structure: "group",
                  children: [
                    {
                      nodeId: sourceLeafId,
                      isPruned: false,
                      role: "text",
                      text: "Hello world",
                    },
                  ],
                },
              ],
            },
          ],
        })
        storage.putNodeData("web-rendering", `${label}_p1`, {
          sections: [
            {
              sectionIndex: 0,
              sectionType: "content",
              reasoning: "rendered",
              html:
                `<section data-section-id="${label}_p1_sec001">` +
                `<div data-id="${sourceContainerId}">` +
                `<p data-id="${sourceLeafId}">Hello world</p>` +
                "</div></section>",
            },
          ],
        })
      } finally {
        storage.close()
      }

      const res = await app.request(
        `/api/books/${label}/pages/${label}_p1/sections/0/clone`,
        { method: "POST" }
      )

      expect(res.status).toBe(200)

      const verify = createBookStorage(label, tmpDir)
      try {
        const sectioningRow = verify.getLatestNodeData("page-sectioning", `${label}_p1`)
        const sectioning = sectioningRow?.data as {
          sections: Array<{
            sectionId: string
            nodes: Array<{
              nodeId: string
              children?: Array<{ nodeId: string }>
            }>
          }>
        }
        expect(sectioning.sections).toHaveLength(2)

        const original = sectioning.sections[0]
        const cloned = sectioning.sections[1]
        expect(cloned.sectionId).toBe(`${label}_p1_sec002`)
        expect(cloned.nodes[0]?.nodeId).not.toBe(original.nodes[0]?.nodeId)
        expect(cloned.nodes[0]?.children?.[0]?.nodeId).toBe(sourceLeafId)

        const renderingRow = verify.getLatestNodeData("web-rendering", `${label}_p1`)
        const rendering = renderingRow?.data as {
          sections: Array<{ sectionIndex: number; html: string }>
        }
        const clonedRendering = rendering.sections.find((section) => section.sectionIndex === 1)
        expect(clonedRendering?.html).toContain(`data-section-id="${label}_p1_sec002"`)
        expect(clonedRendering?.html).toContain(`data-id="${cloned.nodes[0]?.nodeId}"`)
        expect(clonedRendering?.html).toContain(`data-id="${sourceLeafId}"`)
        expect(clonedRendering?.html).not.toContain(`data-id="${sourceContainerId}"`)
      } finally {
        verify.close()
      }
    })
  })

  describe("editable-activity migration on section operations", () => {
    // Minimal schema-valid multiple-choice activity — an invalid stored
    // entity would silently skip migration (readEditableActivities bails).
    const mcActivity = (title: string) => ({
      kind: "multiple-choice",
      sectionType: "activity_multiple_choice",
      enabled: true,
      title: { text: title },
      steps: [
        {
          id: `${title}-q1`,
          prompt: { text: "Which one?" },
          options: [
            { itemId: "item-1", correct: true, text: { text: "Right" } },
            { itemId: "item-2", correct: false, text: { text: "Wrong" } },
          ],
        },
      ],
    })

    const section = (n: number) => ({
      sectionId: `${label}_p1_sec${String(n).padStart(3, "0")}`,
      sectionType: "activity_multiple_choice",
      backgroundColor: "#ffffff",
      textColor: "#000000",
      pageNumber: 1,
      isPruned: false,
      nodes: [
        {
          nodeId: `${label}_p1_n${String(n).padStart(3, "0")}`,
          isPruned: false,
          role: "text",
          text: `Activity ${n}`,
        },
      ],
    })

    it("deleting a section drops its entry and shifts the rest down", async () => {
      const storage = createBookStorage(label, tmpDir)
      try {
        storage.putNodeData("page-sectioning", `${label}_p1`, {
          reasoning: "two same-type activities",
          sections: [section(1), section(2)],
        })
        storage.putNodeData("editable-activity", `${label}_p1`, {
          activities: { "0": mcActivity("first"), "1": mcActivity("second") },
        })
      } finally {
        storage.close()
      }

      const res = await app.request(
        `/api/books/${label}/pages/${label}_p1/sections/0`,
        { method: "DELETE" }
      )
      expect(res.status).toBe(200)

      const verify = createBookStorage(label, tmpDir)
      try {
        const row = verify.getLatestNodeData("editable-activity", `${label}_p1`)
        const activities = (row?.data as {
          activities: Record<string, { title?: { text: string } }>
        }).activities
        // The deleted section's entry is gone; the surviving activity moved to
        // index 0 with the section it belongs to — it must NOT keep key "1",
        // and the stale key "0" must not point at the first activity anymore.
        expect(Object.keys(activities)).toEqual(["0"])
        expect(activities["0"]?.title?.text).toBe("second")
      } finally {
        verify.close()
      }
    })

    it("cloning a section copies its entry and shifts later entries up", async () => {
      const storage = createBookStorage(label, tmpDir)
      try {
        storage.putNodeData("page-sectioning", `${label}_p1`, {
          reasoning: "activity then activity",
          sections: [section(1), section(2)],
        })
        storage.putNodeData("editable-activity", `${label}_p1`, {
          activities: { "0": mcActivity("first"), "1": mcActivity("second") },
        })
      } finally {
        storage.close()
      }

      const res = await app.request(
        `/api/books/${label}/pages/${label}_p1/sections/0/clone`,
        { method: "POST" }
      )
      expect(res.status).toBe(200)

      const verify = createBookStorage(label, tmpDir)
      try {
        const row = verify.getLatestNodeData("editable-activity", `${label}_p1`)
        const activities = (row?.data as {
          activities: Record<string, { title?: { text: string } }>
        }).activities
        expect(activities["0"]?.title?.text).toBe("first")
        expect(activities["1"]?.title?.text).toBe("first")
        expect(activities["2"]?.title?.text).toBe("second")
      } finally {
        verify.close()
      }
    })
  })

  describe("POST /api/books/:label/pages/:pageId/sections/:sectionIndex/split", () => {
    /** Seed page 1 with one section of three top-level nodes (last one nested). */
    function seedThreeNodeSection(options?: { placement?: boolean; rendering?: boolean }) {
      const storage = createBookStorage(label, tmpDir)
      try {
        storage.putNodeData("page-sectioning", `${label}_p1`, {
          reasoning: "sectioned",
          sections: [
            {
              sectionId: `${label}_p1_sec001`,
              sectionType: "activity_multiple_choice",
              backgroundColor: "#ffffff",
              textColor: "#000000",
              pageNumber: 1,
              isPruned: false,
              nodes: [
                { nodeId: `${label}_p1_n0001`, isPruned: false, role: "text", text: "Instructions" },
                { nodeId: `${label}_p1_n0002`, isPruned: false, role: "text", text: "Question 1" },
                {
                  nodeId: `${label}_p1_n0003`,
                  isPruned: false,
                  structure: "group",
                  children: [
                    { nodeId: `${label}_p1_n0004`, isPruned: false, role: "text", text: "Question 2" },
                  ],
                },
              ],
              ...(options?.placement
                ? {
                    viewport: { width: 595, height: 842 },
                    placement: {
                      [`${label}_p1_n0001`]: { textAlign: "center" },
                      [`${label}_p1_n0002`]: { textAlign: "right" },
                      [`${label}_p1_n0004`]: { textAlign: "center" },
                    },
                  }
                : {}),
            },
            {
              sectionId: `${label}_p1_sec002`,
              sectionType: "content",
              backgroundColor: "#ffffff",
              textColor: "#000000",
              pageNumber: 1,
              isPruned: false,
              nodes: [
                { nodeId: `${label}_p1_n0005`, isPruned: false, role: "text", text: "Other section" },
              ],
            },
          ],
        })
        if (options?.rendering) {
          storage.putNodeData("web-rendering", `${label}_p1`, {
            sections: [
              {
                sectionIndex: 0,
                sectionType: "activity_multiple_choice",
                reasoning: "rendered",
                html: `<section data-section-id="${label}_p1_sec001"><p>Activity</p></section>`,
              },
              {
                sectionIndex: 1,
                sectionType: "content",
                reasoning: "rendered",
                html: `<section data-section-id="${label}_p1_sec002"><p>Other</p></section>`,
              },
            ],
          })
        }
      } finally {
        storage.close()
      }
    }

    it("marks the storyboard chain stale, since both halves lose their HTML", async () => {
      seedThreeNodeSection({ rendering: true })
      const seed = createBookStorage(label, tmpDir)
      try {
        seed.markStepCompleted("web-rendering")
        seed.markStepCompleted("package-web")
      } finally {
        seed.close()
      }

      const res = await app.request(
        `/api/books/${label}/pages/${label}_p1/sections/0/split`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ beforeNodeIndex: 1 }),
        }
      )
      expect(res.status).toBe(200)

      const after = createBookStorage(label, tmpDir)
      try {
        // Without this the split sections would silently vanish from the
        // packaged book while the storyboard still reported "done".
        const steps = after.getStepRuns().map((r) => r.step)
        expect(steps).not.toContain("web-rendering")
        expect(steps).not.toContain("package-web")
      } finally {
        after.close()
      }
    })

    it("does not split while a pipeline step is running", async () => {
      seedThreeNodeSection({ rendering: true })
      const seed = createBookStorage(label, tmpDir)
      try {
        seed.markStepStarted("web-rendering")
      } finally {
        seed.close()
      }

      const res = await app.request(
        `/api/books/${label}/pages/${label}_p1/sections/0/split`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ beforeNodeIndex: 1 }),
        }
      )
      expect(res.status).toBe(409)

      const after = createBookStorage(label, tmpDir)
      try {
        const sectioning = after.getLatestNodeData("page-sectioning", `${label}_p1`)
          ?.data as { sections: unknown[] }
        expect(sectioning.sections).toHaveLength(2)
        expect(after.getStepRuns()).toContainEqual(
          expect.objectContaining({ step: "web-rendering", status: "running" })
        )
      } finally {
        after.close()
      }
    })

    it("splits a section before a top-level node and renumbers sectionIds", async () => {
      seedThreeNodeSection({ rendering: true })

      const res = await app.request(
        `/api/books/${label}/pages/${label}_p1/sections/0/split`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ beforeNodeIndex: 1 }),
        }
      )

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.splitSectionIndex).toBe(1)

      const verify = createBookStorage(label, tmpDir)
      try {
        const sectioningRow = verify.getLatestNodeData("page-sectioning", `${label}_p1`)
        const sectioning = sectioningRow?.data as {
          sections: Array<{
            sectionId: string
            sectionType: string
            nodes: Array<{ nodeId: string }>
          }>
        }
        expect(sectioning.sections).toHaveLength(3)
        expect(sectioning.sections.map((s) => s.sectionId)).toEqual([
          `${label}_p1_sec001`,
          `${label}_p1_sec002`,
          `${label}_p1_sec003`,
        ])
        expect(sectioning.sections[0].nodes.map((n) => n.nodeId)).toEqual([
          `${label}_p1_n0001`,
        ])
        expect(sectioning.sections[1].nodes.map((n) => n.nodeId)).toEqual([
          `${label}_p1_n0002`,
          `${label}_p1_n0003`,
        ])
        // Both halves inherit the original section type.
        expect(sectioning.sections[0].sectionType).toBe("activity_multiple_choice")
        expect(sectioning.sections[1].sectionType).toBe("activity_multiple_choice")
        // The untouched section shifts to index 2.
        expect(sectioning.sections[2].nodes.map((n) => n.nodeId)).toEqual([
          `${label}_p1_n0005`,
        ])

        // Rendering: split section's entry dropped, other section shifted +1
        // with its data-section-id rewritten.
        const renderingRow = verify.getLatestNodeData("web-rendering", `${label}_p1`)
        const rendering = renderingRow?.data as {
          sections: Array<{ sectionIndex: number; html: string }>
        }
        expect(rendering.sections).toHaveLength(1)
        expect(rendering.sections[0].sectionIndex).toBe(2)
        expect(rendering.sections[0].html).toContain(
          `data-section-id="${label}_p1_sec003"`
        )
      } finally {
        verify.close()
      }
    })

    it("partitions the fixed-layout placement sidecar by subtree", async () => {
      seedThreeNodeSection({ placement: true })

      const res = await app.request(
        `/api/books/${label}/pages/${label}_p1/sections/0/split`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ beforeNodeIndex: 1 }),
        }
      )

      expect(res.status).toBe(200)

      const verify = createBookStorage(label, tmpDir)
      try {
        const sectioningRow = verify.getLatestNodeData("page-sectioning", `${label}_p1`)
        const sectioning = sectioningRow?.data as {
          sections: Array<{
            viewport?: { width: number; height: number }
            placement?: Record<string, unknown>
          }>
        }
        expect(Object.keys(sectioning.sections[0].placement ?? {})).toEqual([
          `${label}_p1_n0001`,
        ])
        // Placement for the nested leaf n0004 follows its moved parent n0003.
        expect(Object.keys(sectioning.sections[1].placement ?? {}).sort()).toEqual([
          `${label}_p1_n0002`,
          `${label}_p1_n0004`,
        ])
        expect(sectioning.sections[0].viewport).toEqual({ width: 595, height: 842 })
        expect(sectioning.sections[1].viewport).toEqual({ width: 595, height: 842 })
      } finally {
        verify.close()
      }
    })

    it("splits before a nested node, splitting ancestor containers", async () => {
      const storage = createBookStorage(label, tmpDir)
      try {
        storage.putNodeData("page-sectioning", `${label}_p1`, {
          reasoning: "sectioned",
          sections: [
            {
              sectionId: `${label}_p1_sec001`,
              sectionType: "activity_multiple_choice",
              backgroundColor: "#ffffff",
              textColor: "#000000",
              pageNumber: 1,
              isPruned: false,
              nodes: [
                { nodeId: `${label}_p1_n0001`, isPruned: false, role: "text", text: "Intro" },
                {
                  nodeId: `${label}_p1_n0002`,
                  isPruned: false,
                  structure: "group",
                  children: [
                    { nodeId: `${label}_p1_n0003`, isPruned: false, role: "text", text: "Q1" },
                    { nodeId: `${label}_p1_n0004`, isPruned: false, role: "text", text: "Q2" },
                    { nodeId: `${label}_p1_n0005`, isPruned: false, role: "text", text: "Q3" },
                  ],
                },
              ],
              placement: {
                [`${label}_p1_n0001`]: { textAlign: "center" },
                [`${label}_p1_n0002`]: { textAlign: "right" },
                [`${label}_p1_n0004`]: { textAlign: "center" },
              },
            },
          ],
        })
      } finally {
        storage.close()
      }

      const res = await app.request(
        `/api/books/${label}/pages/${label}_p1/sections/0/split`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ beforeNodeId: `${label}_p1_n0004` }),
        }
      )

      expect(res.status).toBe(200)

      const verify = createBookStorage(label, tmpDir)
      try {
        const sectioningRow = verify.getLatestNodeData("page-sectioning", `${label}_p1`)
        const sectioning = sectioningRow?.data as {
          sections: Array<{
            sectionId: string
            nodes: Array<{
              nodeId: string
              structure?: string
              children?: Array<{ nodeId: string }>
            }>
            placement?: Record<string, unknown>
          }>
        }
        expect(sectioning.sections).toHaveLength(2)

        // Kept half: intro leaf + the original group trimmed to Q1.
        const kept = sectioning.sections[0]
        expect(kept.nodes.map((n) => n.nodeId)).toEqual([
          `${label}_p1_n0001`,
          `${label}_p1_n0002`,
        ])
        expect(kept.nodes[1].children?.map((c) => c.nodeId)).toEqual([
          `${label}_p1_n0003`,
        ])

        // Moved half: a fresh-id group shell carrying Q2 and Q3.
        const moved = sectioning.sections[1]
        expect(moved.nodes).toHaveLength(1)
        const shell = moved.nodes[0]
        expect(shell.structure).toBe("group")
        expect(shell.nodeId).not.toBe(`${label}_p1_n0002`)
        expect(shell.nodeId).toMatch(new RegExp(`^${label}_p1_n\\d{4}$`))
        expect(shell.children?.map((c) => c.nodeId)).toEqual([
          `${label}_p1_n0004`,
          `${label}_p1_n0005`,
        ])

        // Placement follows the nodes; the original group shell's entry
        // stays with the kept half.
        expect(Object.keys(kept.placement ?? {}).sort()).toEqual([
          `${label}_p1_n0001`,
          `${label}_p1_n0002`,
        ])
        expect(Object.keys(moved.placement ?? {})).toEqual([
          `${label}_p1_n0004`,
        ])
      } finally {
        verify.close()
      }
    })

    it("narrows sourcePageIds to the half that still contains foreign content", async () => {
      const storage = createBookStorage(label, tmpDir)
      try {
        storage.putNodeData("page-sectioning", `${label}_p1`, {
          reasoning: "sectioned",
          sections: [
            {
              sectionId: `${label}_p1_sec001`,
              sectionType: "activity_multiple_choice",
              backgroundColor: "#ffffff",
              textColor: "#000000",
              pageNumber: 1,
              isPruned: false,
              nodes: [
                { nodeId: `${label}_p1_n0001`, isPruned: false, role: "text", text: "Local" },
                { nodeId: `${label}_p9_n0001`, isPruned: false, role: "text", text: "Merged in" },
              ],
              sourcePageIds: [`${label}_p9`],
            },
          ],
        })
      } finally {
        storage.close()
      }

      const res = await app.request(
        `/api/books/${label}/pages/${label}_p1/sections/0/split`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ beforeNodeIndex: 1 }),
        }
      )
      expect(res.status).toBe(200)

      const verify = createBookStorage(label, tmpDir)
      try {
        const row = verify.getLatestNodeData("page-sectioning", `${label}_p1`)
        const sectioning = row?.data as {
          sections: Array<{ sourcePageIds?: string[] }>
        }
        // Only the half holding the merged-in nodes keeps the provenance.
        expect(sectioning.sections[0].sourcePageIds).toBeUndefined()
        expect(sectioning.sections[1].sourcePageIds).toEqual([`${label}_p9`])
      } finally {
        verify.close()
      }
    })

    it("returns 400 when splitting before the first node of the section", async () => {
      seedThreeNodeSection()

      const res = await app.request(
        `/api/books/${label}/pages/${label}_p1/sections/0/split`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ beforeNodeId: `${label}_p1_n0001` }),
        }
      )
      expect(res.status).toBe(400)
    })

    it("returns 400 unless exactly one of beforeNodeIndex/beforeNodeId is given", async () => {
      seedThreeNodeSection()

      const neither = await app.request(
        `/api/books/${label}/pages/${label}_p1/sections/0/split`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        }
      )
      expect(neither.status).toBe(400)

      const both = await app.request(
        `/api/books/${label}/pages/${label}_p1/sections/0/split`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            beforeNodeIndex: 1,
            beforeNodeId: `${label}_p1_n0002`,
          }),
        }
      )
      expect(both.status).toBe(400)
    })

    it("returns 400 when beforeNodeIndex is out of range or zero", async () => {
      seedThreeNodeSection()

      const outOfRange = await app.request(
        `/api/books/${label}/pages/${label}_p1/sections/0/split`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ beforeNodeIndex: 3 }),
        }
      )
      expect(outOfRange.status).toBe(400)

      const zero = await app.request(
        `/api/books/${label}/pages/${label}_p1/sections/0/split`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ beforeNodeIndex: 0 }),
        }
      )
      expect(zero.status).toBe(400)
    })
  })

  describe("POST /api/books/:label/pages/:pageId/sections/:sectionIndex/merge", () => {
    it("merges adjacent sections and unions the placement sidecar", async () => {
      const storage = createBookStorage(label, tmpDir)
      try {
        storage.putNodeData("page-sectioning", `${label}_p1`, {
          reasoning: "sectioned",
          sections: [
            {
              sectionId: `${label}_p1_sec001`,
              sectionType: "content",
              backgroundColor: "#ffffff",
              textColor: "#000000",
              pageNumber: 1,
              isPruned: false,
              nodes: [
                { nodeId: `${label}_p1_n0001`, isPruned: false, role: "text", text: "First" },
              ],
              viewport: { width: 595, height: 842 },
              placement: { [`${label}_p1_n0001`]: { textAlign: "center" } },
            },
            {
              sectionId: `${label}_p1_sec002`,
              sectionType: "content",
              backgroundColor: "#ffffff",
              textColor: "#000000",
              pageNumber: 1,
              isPruned: false,
              nodes: [
                { nodeId: `${label}_p1_n0002`, isPruned: false, role: "text", text: "Second" },
              ],
              placement: { [`${label}_p1_n0002`]: { textAlign: "right" } },
            },
          ],
        })
      } finally {
        storage.close()
      }

      const res = await app.request(
        `/api/books/${label}/pages/${label}_p1/sections/0/merge?direction=next`,
        { method: "POST" }
      )

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.mergedSectionIndex).toBe(0)

      const verify = createBookStorage(label, tmpDir)
      try {
        const sectioningRow = verify.getLatestNodeData("page-sectioning", `${label}_p1`)
        const sectioning = sectioningRow?.data as {
          sections: Array<{
            sectionId: string
            nodes: Array<{ nodeId: string }>
            viewport?: { width: number; height: number }
            placement?: Record<string, unknown>
          }>
        }
        expect(sectioning.sections).toHaveLength(1)
        expect(sectioning.sections[0].sectionId).toBe(`${label}_p1_sec001`)
        expect(sectioning.sections[0].nodes.map((n) => n.nodeId)).toEqual([
          `${label}_p1_n0001`,
          `${label}_p1_n0002`,
        ])
        expect(Object.keys(sectioning.sections[0].placement ?? {}).sort()).toEqual([
          `${label}_p1_n0001`,
          `${label}_p1_n0002`,
        ])
        expect(sectioning.sections[0].viewport).toEqual({ width: 595, height: 842 })
      } finally {
        verify.close()
      }
    })
  })

  describe("POST /api/books/:label/pages/:pageId/sections/:sectionIndex/merge-cross-page", () => {
    function seedBothPages(sourceExtra?: Partial<{ sourcePageIds: string[] }>) {
      const storage = createBookStorage(label, tmpDir)
      try {
        storage.putNodeData("page-sectioning", `${label}_p1`, {
          reasoning: "sectioned",
          sections: [
            {
              sectionId: `${label}_p1_sec001`,
              sectionType: "activity_multiple_choice",
              backgroundColor: "#ffffff",
              textColor: "#000000",
              pageNumber: 1,
              isPruned: false,
              nodes: [
                { nodeId: `${label}_p1_n0001`, isPruned: false, role: "text", text: "Continued activity" },
              ],
              ...sourceExtra,
            },
          ],
        })
        storage.putNodeData("page-sectioning", `${label}_p2`, {
          reasoning: "sectioned",
          sections: [
            {
              sectionId: `${label}_p2_sec001`,
              sectionType: "activity_multiple_choice",
              backgroundColor: "#ffffff",
              textColor: "#000000",
              pageNumber: 2,
              isPruned: false,
              nodes: [
                { nodeId: `${label}_p2_n0001`, isPruned: false, role: "text", text: "Question 4" },
              ],
            },
          ],
        })
      } finally {
        storage.close()
      }
    }

    it("records the source page in the target section's sourcePageIds", async () => {
      seedBothPages()

      const res = await app.request(
        `/api/books/${label}/pages/${label}_p1/sections/0/merge-cross-page?direction=next`,
        { method: "POST" }
      )

      expect(res.status).toBe(200)

      const verify = createBookStorage(label, tmpDir)
      try {
        const tgtRow = verify.getLatestNodeData("page-sectioning", `${label}_p2`)
        const tgt = tgtRow?.data as {
          sections: Array<{
            nodes: Array<{ nodeId: string }>
            sourcePageIds?: string[]
          }>
        }
        expect(tgt.sections).toHaveLength(1)
        // Moved nodes prepended, provenance recorded.
        expect(tgt.sections[0].nodes.map((n) => n.nodeId)).toEqual([
          `${label}_p1_n0001`,
          `${label}_p2_n0001`,
        ])
        expect(tgt.sections[0].sourcePageIds).toEqual([`${label}_p1`])
      } finally {
        verify.close()
      }
    })

    it("carries prior provenance from the moved section", async () => {
      seedBothPages({ sourcePageIds: [`${label}_p0`] })

      const res = await app.request(
        `/api/books/${label}/pages/${label}_p1/sections/0/merge-cross-page?direction=next`,
        { method: "POST" }
      )
      expect(res.status).toBe(200)

      const verify = createBookStorage(label, tmpDir)
      try {
        const tgtRow = verify.getLatestNodeData("page-sectioning", `${label}_p2`)
        const tgt = tgtRow?.data as {
          sections: Array<{ sourcePageIds?: string[] }>
        }
        expect(tgt.sections[0].sourcePageIds?.sort()).toEqual([
          `${label}_p0`,
          `${label}_p1`,
        ])
      } finally {
        verify.close()
      }
    })
  })

  describe("POST /api/books/:label/pages/:pageId/re-render", () => {
    it("returns 400 when X-OpenAI-Key header is missing", async () => {
      const res = await app.request(
        `/api/books/${label}/pages/${label}_p1/re-render`,
        { method: "POST" }
      )

      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error).toContain("X-OpenAI-Key")
    })

    it("returns 400 when sectionIndex query is out of range", async () => {
      const res = await app.request(
        `/api/books/${label}/pages/${label}_p1/re-render?sectionIndex=99`,
        {
          method: "POST",
          headers: { "X-OpenAI-Key": "sk-test" },
        }
      )

      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error).toContain("out of range")
    })
  })

  describe("POST /api/books/:label/images/ai-generate", () => {
    const pageId = "test-book_p1"
    const endpoint = `/api/books/${label}/images/ai-generate?pageId=${pageId}`

    it("returns 400 when X-OpenAI-Key header is missing", async () => {
      const res = await app.request(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: "a cat" }),
      })

      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error).toContain("X-OpenAI-Key")
    })

    it("returns 400 when pageId query param is missing", async () => {
      const res = await app.request(`/api/books/${label}/images/ai-generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-OpenAI-Key": "sk-test",
        },
        body: JSON.stringify({ prompt: "a cat" }),
      })

      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error).toContain("pageId")
    })

    it("returns 400 when prompt is missing", async () => {
      const res = await app.request(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-OpenAI-Key": "sk-test",
        },
        body: JSON.stringify({}),
      })

      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error).toContain("prompt")
    })

    it("returns 404 for nonexistent book", async () => {
      const res = await app.request(
        `/api/books/no-such-book/images/ai-generate?pageId=pg001`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-OpenAI-Key": "sk-test",
          },
          body: JSON.stringify({ prompt: "a cat" }),
        }
      )

      expect(res.status).toBe(404)
    })

    it("rejects referenceImageId with path traversal characters", async () => {
      const res = await app.request(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-OpenAI-Key": "sk-test",
        },
        body: JSON.stringify({
          prompt: "a cat",
          referenceImageId: "../../../etc/passwd",
        }),
      })

      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error).toContain("Invalid image ID")
    })

    it("rejects targetImageId with path traversal characters", async () => {
      const res = await app.request(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-OpenAI-Key": "sk-test",
        },
        body: JSON.stringify({
          prompt: "a cat",
          targetImageId: "../../secret",
        }),
      })

      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error).toContain("Invalid image ID")
    })

    it("returns 404 when reference image file does not exist", async () => {
      const res = await app.request(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-OpenAI-Key": "sk-test",
        },
        body: JSON.stringify({
          prompt: "make it brighter",
          referenceImageId: "nonexistent-image",
        }),
      })

      expect(res.status).toBe(404)
      const body = await res.json()
      expect(body.error).toContain("Reference image not found")
    })
  })

  describe("POST /api/books/:label/images (crop upload)", () => {
    it("uploads a cropped image and returns new imageId", async () => {
      // Create a minimal valid PNG (1x1 pixel)
      const pngHeader = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG signature
        0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
        0x00, 0x00, 0x00, 0x01, // width: 1
        0x00, 0x00, 0x00, 0x01, // height: 1
        0x08, 0x02, 0x00, 0x00, 0x00, // bit depth, color type, etc.
        0x90, 0x77, 0x53, 0xde, // CRC
      ])

      const formData = new FormData()
      formData.append("image", new Blob([pngHeader], { type: "image/png" }), "crop.png")
      formData.append("pageId", `${label}_p1`)
      formData.append("sourceImageId", `${label}_p1_page`)

      const res = await app.request(`/api/books/${label}/images`, {
        method: "POST",
        body: formData,
      })

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.imageId).toBe(`${label}_p1_page_crop1`)
      expect(body.width).toBe(1)
      expect(body.height).toBe(1)
    })

    it("increments crop suffix for duplicate uploads", async () => {
      const pngHeader = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
        0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
        0x00, 0x00, 0x00, 0x02,
        0x00, 0x00, 0x00, 0x02,
        0x08, 0x02, 0x00, 0x00, 0x00,
        0xfd, 0xd4, 0x9a, 0x73,
      ])

      // First upload
      const form1 = new FormData()
      form1.append("image", new Blob([pngHeader], { type: "image/png" }), "crop.png")
      form1.append("pageId", `${label}_p1`)
      form1.append("sourceImageId", `${label}_p1_page`)
      await app.request(`/api/books/${label}/images`, { method: "POST", body: form1 })

      // Second upload
      const form2 = new FormData()
      form2.append("image", new Blob([pngHeader], { type: "image/png" }), "crop.png")
      form2.append("pageId", `${label}_p1`)
      form2.append("sourceImageId", `${label}_p1_page`)
      const res = await app.request(`/api/books/${label}/images`, { method: "POST", body: form2 })

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.imageId).toBe(`${label}_p1_page_crop2`)
    })

    it("returns 400 when image file is missing", async () => {
      const formData = new FormData()
      formData.append("pageId", `${label}_p1`)
      formData.append("sourceImageId", `${label}_p1_page`)

      const res = await app.request(`/api/books/${label}/images`, {
        method: "POST",
        body: formData,
      })

      expect(res.status).toBe(400)
    })

    it("returns 400 when pageId is missing", async () => {
      const formData = new FormData()
      formData.append("image", new Blob([Buffer.alloc(10)], { type: "image/png" }), "crop.png")
      formData.append("sourceImageId", `${label}_p1_page`)

      const res = await app.request(`/api/books/${label}/images`, {
        method: "POST",
        body: formData,
      })

      expect(res.status).toBe(400)
    })

    it("returns 400 when sourceImageId is missing", async () => {
      const formData = new FormData()
      formData.append("image", new Blob([Buffer.alloc(10)], { type: "image/png" }), "crop.png")
      formData.append("pageId", `${label}_p1`)

      const res = await app.request(`/api/books/${label}/images`, {
        method: "POST",
        body: formData,
      })

      expect(res.status).toBe(400)
    })

    it("rejects sourceImageId with path traversal characters", async () => {
      const formData = new FormData()
      formData.append("image", new Blob([Buffer.alloc(10)], { type: "image/png" }), "crop.png")
      formData.append("pageId", `${label}_p1`)
      formData.append("sourceImageId", "../../../etc/passwd")

      const res = await app.request(`/api/books/${label}/images`, {
        method: "POST",
        body: formData,
      })

      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error).toContain("Invalid image ID")
    })

    it("returns 404 for nonexistent book", async () => {
      const formData = new FormData()
      formData.append("image", new Blob([Buffer.alloc(10)], { type: "image/png" }), "crop.png")
      formData.append("pageId", "pg001")
      formData.append("sourceImageId", "img001")

      const res = await app.request(`/api/books/no-such-book/images`, {
        method: "POST",
        body: formData,
      })

      expect(res.status).toBe(404)
    })
  })

  // ---------------------------------------------------------------------------
  // Downstream data clearing tests
  // ---------------------------------------------------------------------------

  /**
   * Seed downstream pipeline data and step_runs so we can verify they get
   * cleared after storyboard/image edits.
   */
  function seedDownstreamData(dir: string, bookLabel: string) {
    const s = createBookStorage(bookLabel, dir)
    try {
      s.putNodeData("image-captioning", `${bookLabel}_p1`, {
        captions: [{ imageId: "img1", reasoning: "test", caption: "A cat" }],
      })
      s.putNodeData("text-catalog", `${bookLabel}_p1`, {
        entries: [{ id: "t1", text: "Hello" }],
      })
      s.putNodeData("text-catalog-translation", `${bookLabel}_p1`, {
        locale: "es", entries: [{ id: "t1", text: "Hola" }],
      })
      s.putNodeData("easy-read", "book", {
        blocks: [{
          pageId: `${bookLabel}_p1`,
          pageNumber: 1,
          sectionId: `${bookLabel}_p1_sec001`,
          sectionIndex: 0,
          sectionType: "content",
          entries: [{
            sourceId: "t1",
            easyReadId: "t1_easy_read",
            originalText: "Hello",
            text: "Easy hello",
            pageId: `${bookLabel}_p1`,
            sectionId: `${bookLabel}_p1_sec001`,
            sectionIndex: 0,
          }],
        }],
        generatedAt: "2026-01-01T00:00:00.000Z",
      })
      s.putNodeData("tts", `${bookLabel}_p1`, {
        entries: [{ id: "t1", url: "audio.mp3" }],
      })
      s.putNodeData("tts-timestamps", "en", {
        entries: { t1: { words: [{ text: "Hello", start: 0, end: 1 }] } },
      })
      s.putNodeData("accessibility-assessment", "book", {
        summary: { violations: 0 },
        pages: [],
      })
      // Mark corresponding steps as completed
      s.markStepCompleted("image-captioning")
      s.markStepCompleted("text-catalog")
      s.markStepCompleted("easy-read")
      s.markStepCompleted("catalog-translation")
      s.markStepCompleted("image-translation")
      s.markStepCompleted("tts")
      s.markStepCompleted("word-timestamps")
      s.markStepCompleted("package-web")
      s.markStepCompleted("accessibility-assessment")
    } finally {
      s.close()
    }
  }

  /** Assert that all storyboard-dependent node data and step_runs were cleared. */
  function expectAllDownstreamCleared(dir: string, bookLabel: string) {
    const s = createBookStorage(bookLabel, dir)
    try {
      // Node data should be gone
      expect(s.getLatestNodeData("image-captioning", `${bookLabel}_p1`)).toBeNull()
      expect(s.getLatestNodeData("text-catalog", `${bookLabel}_p1`)).toBeNull()
      expect(s.getLatestNodeData("text-catalog-translation", `${bookLabel}_p1`)).toBeNull()
      expect(s.getLatestNodeData("easy-read", "book")).toBeNull()
      expect(s.getLatestNodeData("tts", `${bookLabel}_p1`)).toBeNull()
      expect(s.getLatestNodeData("tts-timestamps", "en")).toBeNull()
      expect(s.getLatestNodeData("accessibility-assessment", "book")).toBeNull()
      // Step runs should be gone
      const runs = s.getStepRuns()
      const clearedSteps = [
        "image-captioning",
        "text-catalog",
        "easy-read",
        "catalog-translation",
        "image-translation",
        "tts",
        "word-timestamps",
        "package-web",
        "accessibility-assessment",
      ]
      for (const step of clearedSteps) {
        expect(runs.find((r) => r.step === step)).toBeUndefined()
      }
    } finally {
      s.close()
    }
  }

  /** Assert that translate/speech (but NOT image-captioning) node data and step_runs were cleared. */
  function expectTextAndSpeechCleared(dir: string, bookLabel: string) {
    const s = createBookStorage(bookLabel, dir)
    try {
      // image-captioning should still exist
      expect(s.getLatestNodeData("image-captioning", `${bookLabel}_p1`)).not.toBeNull()
      expect(s.getLatestNodeData("easy-read", "book")).not.toBeNull()
      // text-catalog, translations, tts should be gone
      expect(s.getLatestNodeData("text-catalog", `${bookLabel}_p1`)).toBeNull()
      expect(s.getLatestNodeData("text-catalog-translation", `${bookLabel}_p1`)).toBeNull()
      expect(s.getLatestNodeData("tts", `${bookLabel}_p1`)).toBeNull()
      expect(s.getLatestNodeData("tts-timestamps", "en")).toBeNull()
      expect(s.getLatestNodeData("accessibility-assessment", "book")).toBeNull()
      // Step runs: image-captioning should remain, text steps should be gone
      const runs = s.getStepRuns()
      expect(runs.find((r) => r.step === "image-captioning")).toBeDefined()
      expect(runs.find((r) => r.step === "easy-read")).toBeDefined()
      for (const step of [
        "text-catalog",
        "catalog-translation",
        "image-translation",
        "tts",
        "word-timestamps",
        "package-web",
        "accessibility-assessment",
      ]) {
        expect(runs.find((r) => r.step === step)).toBeUndefined()
      }
    } finally {
      s.close()
    }
  }

  describe("PUT /api/books/:label/pages/:pageId/sectioning clears downstream", () => {
    it("clears caption + translate/speech data on sectioning save", async () => {
      seedDownstreamData(tmpDir, label)

      const data = {
        reasoning: "updated",
        sections: [{
          sectionId: `${label}_p1_sec001`,
          sectionType: "content",
          backgroundColor: "#ffffff",
          textColor: "#000000",
          pageNumber: 1,
          isPruned: false,
          nodes: [
            {
              nodeId: `${label}_p1_g001`,
              isPruned: false,
              structure: "paragraph",
              children: [
                {
                  nodeId: `${label}_p1_n002`,
                  isPruned: false,
                  role: "text",
                  text: "Updated text",
                },
              ],
            },
          ],
        }],
      }

      const res = await app.request(
        `/api/books/${label}/pages/${label}_p1/sectioning`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        }
      )

      expect(res.status).toBe(200)
      expectAllDownstreamCleared(tmpDir, label)
    })
  })

  describe("PUT /api/books/:label/pages/:pageId/rendering clears downstream", () => {
    it("clears caption + translate/speech data on rendering save", async () => {
      seedDownstreamData(tmpDir, label)

      const data = {
        sections: [{
          sectionIndex: 0,
          sectionType: "content",
          reasoning: "updated render",
          html: "<div>Updated</div>",
        }],
      }

      const res = await app.request(
        `/api/books/${label}/pages/${label}_p1/rendering`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        }
      )

      expect(res.status).toBe(200)
      expectAllDownstreamCleared(tmpDir, label)
    })
  })

  describe("POST crop (images) clears downstream", () => {
    it("clears caption + translate/speech data on image crop", async () => {
      seedDownstreamData(tmpDir, label)

      // Minimal valid PNG (1x1 pixel)
      const pngHeader = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
        0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
        0x00, 0x00, 0x00, 0x01,
        0x00, 0x00, 0x00, 0x01,
        0x08, 0x02, 0x00, 0x00, 0x00,
        0x90, 0x77, 0x53, 0xde,
      ])

      const formData = new FormData()
      formData.append("image", new Blob([pngHeader], { type: "image/png" }), "crop.png")
      formData.append("pageId", `${label}_p1`)
      formData.append("sourceImageId", `${label}_p1_page`)

      const res = await app.request(`/api/books/${label}/images`, {
        method: "POST",
        body: formData,
      })

      expect(res.status).toBe(200)
      expectAllDownstreamCleared(tmpDir, label)
    })
  })

  describe("PUT image-captioning clears translate/speech downstream", () => {
    it("clears text-catalog/translations/TTS but keeps image-captioning", async () => {
      seedDownstreamData(tmpDir, label)

      const data = {
        captions: [{ imageId: "img1", reasoning: "updated", caption: "A dog" }],
      }

      const res = await app.request(
        `/api/books/${label}/pages/${label}_p1/image-captioning`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        }
      )

      expect(res.status).toBe(200)
      // image-captioning was just saved (new version), so it should exist
      // but text-catalog, translations, tts should be cleared
      expectTextAndSpeechCleared(tmpDir, label)
    })
  })
})
