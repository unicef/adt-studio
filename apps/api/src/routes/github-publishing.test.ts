import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { Hono } from "hono"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createGitHubPublishingRoutes } from "./github-publishing.js"

const { publishBookToGitHubMock } = vi.hoisted(() => ({
  publishBookToGitHubMock: vi.fn(),
}))

vi.mock("../services/github-publishing-service.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/github-publishing-service.js")>()),
  publishBookToGitHub: publishBookToGitHubMock,
}))

describe("GitHub publishing routes", () => {
  let booksDir: string
  let app: Hono

  beforeEach(() => {
    publishBookToGitHubMock.mockReset()
    booksDir = fs.mkdtempSync(path.join(os.tmpdir(), "adt-github-routes-"))
    fs.mkdirSync(path.join(booksDir, "demo", "adt"), { recursive: true })
    fs.writeFileSync(path.join(booksDir, "demo", "adt", "index.html"), "<h1>Demo</h1>")
    app = createGitHubPublishingRoutes(booksDir, path.join(booksDir, "assets"))
  })

  afterEach(() => {
    fs.rmSync(booksDir, { recursive: true, force: true })
  })

  it("reports unpublished packaged files without requiring GitHub credentials", async () => {
    const response = await app.request("/books/demo/github-publishing/changes")
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      packaged: true,
      sourceChanged: false,
      changes: [{ path: "index.html", status: "added" }],
    })
  })

  it("does not expose a GitHub publishing state before the first deployment", async () => {
    const response = await app.request("/books/demo/github-publishing/status")
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toBeNull()
  })

  it("requires a request-scoped token for connection checks", async () => {
    const response = await app.request("/github/connection")
    expect(response.status).toBe(401)
  })

  it("accepts only one deployment for a book at a time", async () => {
    publishBookToGitHubMock.mockImplementation(() => new Promise(() => undefined))
    const request = () => app.request("/books/demo/github-publishing/publish", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-GitHub-Token": "test-token",
      },
      body: JSON.stringify({ repository: "demo-book", visibility: "public" }),
    })
    expect((await request()).status).toBe(202)
    expect((await request()).status).toBe(409)
    expect(publishBookToGitHubMock).toHaveBeenCalledTimes(1)
  })
})
