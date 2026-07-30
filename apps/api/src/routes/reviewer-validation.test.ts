import { afterEach, beforeEach, describe, expect, it } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { Hono } from "hono"
import { createBookStorage } from "@adt/storage"
import type { ReviewerPageValidationRecord, ReviewerValidationSession } from "@adt/types"
import { errorHandler } from "../middleware/error-handler.js"
import { createReviewerValidationRoutes } from "./reviewer-validation.js"

const label = "validation-book"
const configFolderPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../config",
)


function enableReviewerValidation(configPath: string) {
  fs.writeFileSync(configPath, [
    "role_types:",
    "  heading: Heading",
    "structure_types:",
    "  paragraph: Paragraph",
    "reviewer_validation:",
    "  enabled: true",
  ].join("\n"))
}

describe("Reviewer validation routes", () => {
  let tmpDir: string
  let app: Hono
  let configPath: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "reviewer-validation-routes-"))

    const storage = createBookStorage(label, tmpDir)
    try {
      storage.putExtractedPage({
        pageId: "pg001",
        pageNumber: 1,
        text: "Page one",
        pageImage: {
          imageId: "pg001_page",
          buffer: Buffer.from("fake-png"),
          format: "png",
          hash: "abc123",
          width: 800,
          height: 600,
        },
        images: [],
      })
      storage.putNodeData("metadata", "book", {
        title: "Validation Test Book",
        authors: ["Author"],
        publisher: null,
        language_code: "en",
        cover_page_number: 1,
        reasoning: "test",
      })
    } finally {
      storage.close()
    }

    configPath = path.join(tmpDir, "config.yaml")
    fs.writeFileSync(configPath, [
      "role_types:",
      "  heading: Heading",
      "structure_types:",
      "  paragraph: Paragraph",
    ].join("\n"))

    app = new Hono()
    app.onError(errorHandler)
    app.route("/api", createReviewerValidationRoutes(tmpDir, configFolderPath, configPath))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it("returns the reviewer validation catalog", async () => {
    const res = await app.request(`/api/books/${label}/validation/catalog`)
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.enabled).toBe(false)
    expect(body.identificationFields).toHaveLength(7)
    expect(body.instructions).toHaveLength(2)
    expect(body.pageSections).toHaveLength(10)
  })

  it("stores and returns reviewer validation sessions", async () => {
    enableReviewerValidation(configPath)

    const session: ReviewerValidationSession = {
      session_id: "session-1",
      reviewer_name: "Ada Reviewer",
      institution: "UNICEF",
      language: "en",
      start_page: 1,
      end_page: 5,
    }

    const saveRes = await app.request(`/api/books/${label}/validation/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(session),
    })
    expect(saveRes.status).toBe(201)
    expect((await saveRes.json()).version).toBe(1)

    const listRes = await app.request(`/api/books/${label}/validation/sessions`)
    expect(listRes.status).toBe(200)
    const listBody = await listRes.json()
    expect(listBody.sessions).toHaveLength(1)
    expect(listBody.sessions[0].session.reviewer_name).toBe("Ada Reviewer")

    expect(listBody.sessions[0].session.language).toBe("en")
    expect(listBody.sessions[0].session.catalog_snapshot?.pageSections).toHaveLength(10)
  })

  it("stores multiple versions of reviewer page validation records and lists latest results for a session", async () => {
    enableReviewerValidation(configPath)

    const session: ReviewerValidationSession = {
      session_id: "session-1",
      reviewer_name: "Ada Reviewer",
      language: "sw",
    }

    await app.request(`/api/books/${label}/validation/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(session),
    })

    const initial: ReviewerPageValidationRecord = {
      session_id: "session-1",
      page_id: "pg001",
      section_id: "pg001_sec001",
      page_number: 1,
      href: "content/pages/pg001.html",
      language: "sw",
      results: [
        {
          criterion_id: "text-matches-original-reading-order",
          status: "needs-changes",
          comment: "Heading order differs from the PDF.",
        },
      ],
    }

    const updated: ReviewerPageValidationRecord = {
      ...initial,
      results: [
        {
          criterion_id: "text-matches-original-reading-order",
          status: "pass",
        },
      ],
      overall_comment: "Fixed after template update.",
    }

    const firstRes = await app.request(`/api/books/${label}/validation/page-results`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(initial),
    })
    expect(firstRes.status).toBe(201)
    expect((await firstRes.json()).version).toBe(1)

    const secondRes = await app.request(`/api/books/${label}/validation/page-results`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updated),
    })
    expect(secondRes.status).toBe(201)
    expect((await secondRes.json()).version).toBe(2)

    const listRes = await app.request(
      `/api/books/${label}/validation/page-results?sessionId=session-1&language=sw`,
    )
    expect(listRes.status).toBe(200)
    const listBody = await listRes.json()
    expect(listBody.records).toHaveLength(1)
    expect(listBody.records[0].record.results[0].status).toBe("pass")
    expect(listBody.records[0].version).toBe(2)

    expect(listBody.records[0].record.overall_comment).toBe("Fixed after template update.")
    expect(listBody.records[0].record.section_id).toBe("pg001_sec001")
  })

  it("validates required sessionId query params for page-result listings", async () => {
    const res = await app.request(`/api/books/${label}/validation/page-results`)
    expect(res.status).toBe(400)
  })

  it("blocks creating reviewer sessions when reviewer validation is disabled", async () => {
    const session: ReviewerValidationSession = {
      session_id: "session-disabled",
      reviewer_name: "Ada Reviewer",
    }

    const res = await app.request(`/api/books/${label}/validation/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(session),
    })

    expect(res.status).toBe(409)
    expect(await res.text()).toContain("Reviewer validation is disabled")
  })

  it("blocks saving reviewer page results when reviewer validation is disabled", async () => {
    const record: ReviewerPageValidationRecord = {
      session_id: "session-disabled",
      page_id: "pg001",
      href: "content/pages/pg001.html",
      results: [],
    }

    const res = await app.request(`/api/books/${label}/validation/page-results`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(record),
    })

    expect(res.status).toBe(409)
    expect(await res.text()).toContain("Reviewer validation is disabled")
  })

  it("returns config-defined reviewer validation catalog overrides", async () => {
    fs.writeFileSync(configPath, [
      "role_types:",
      "  heading: Heading",
      "structure_types:",
      "  paragraph: Paragraph",
      "reviewer_validation:",
      "  enabled: true",
      "  sections:",
      "    - id: custom-checks",
      "      label: Custom checks",
      "      fix_stage: sectioning",
      "      criteria:",
      "        - id: custom-criterion",
      "          label: Custom criterion",
      "          guidance: Check this custom requirement.",
      "          fix_stage: storyboard",
      "  instructions:",
      "    - id: custom-workflow",
      "      title: Custom workflow",
      "      body: Follow the custom workflow.",
      "  identification_fields:",
      "    - id: reviewer-name",
      "      label: Reviewer name",
      "      type: text",
      "      required: true",
    ].join("\n"))

    app = new Hono()
    app.onError(errorHandler)
    app.route("/api", createReviewerValidationRoutes(tmpDir, configFolderPath, configPath))

    const res = await app.request(`/api/books/${label}/validation/catalog`)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.enabled).toBe(true)
    expect(body.pageSections).toHaveLength(1)
    expect(body.pageSections[0].id).toBe("custom-checks")
    expect(body.pageSections[0].fix_stage).toBe("sectioning")
    expect(body.pageSections[0].criteria[0].fix_stage).toBe("storyboard")
    expect(body.instructions[0].id).toBe("custom-workflow")
    expect(body.identificationFields).toHaveLength(1)
  })

})
