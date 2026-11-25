import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { Hono } from "hono"
import { createBookStorage } from "@adt/storage"
import {
  getStageRerunClearNodes,
  IMAGE_SET_CHANGE_CLEAR_NODE_TYPES,
  READER_SOURCE_MODE_NODE,
  READER_SOURCE_NODE,
  STAGE_ORDER,
} from "@adt/types"
import { errorHandler } from "../middleware/error-handler.js"
import { createReaderSourceRoutes } from "./reader-source.js"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..")
const webAssetsDir = path.join(repoRoot, "assets", "adt")
const label = "reader-route-book"
const DOCK = "features/dock/components/DockIconButton.tsx"

describe("reader source routes", () => {
  let booksDir: string
  let app: Hono

  beforeEach(() => {
    booksDir = fs.mkdtempSync(path.join(os.tmpdir(), "adt-reader-route-"))
    createBookStorage(label, booksDir).close()
    app = new Hono().onError(errorHandler).route("/", createReaderSourceRoutes(booksDir, webAssetsDir))
  })

  afterEach(() => {
    fs.rmSync(booksDir, { recursive: true, force: true })
  })

  const send = (method: string, url: string, body: unknown) =>
    app.request(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
  const json = async (response: Response) => ({ status: response.status, body: await response.json() })

  it("serves the base tree and file before any customization", async () => {
    const tree = await json(await app.request(`/books/${label}/reader-source/tree`))
    expect(tree.body.followsGlobal).toBe(true)
    expect(tree.body.files).toContainEqual({ path: DOCK, layer: "base", version: null, outdated: false })

    const file = await json(await app.request(`/books/${label}/reader-source/file?path=${encodeURIComponent(DOCK)}`))
    expect(file.body).toMatchObject({ path: DOCK, layer: "base", version: null })
  })

  it("AC-15: a stale save returns 409", async () => {
    const first = await json(await send("PUT", `/books/${label}/reader-source/file`, { path: DOCK, content: "one", baseVersion: null }))
    expect(first.status).toBe(200)
    await send("PUT", `/books/${label}/reader-source/file`, { path: DOCK, content: "two", baseVersion: first.body.version })

    const stale = await send("PUT", `/books/${label}/reader-source/file`, { path: DOCK, content: "lost", baseVersion: first.body.version })
    expect(stale.status).toBe(409)
  })

  it("AC-16: revert and restore append versions and keep the history", async () => {
    const saved = await json(await send("PUT", `/books/${label}/reader-source/file`, { path: DOCK, content: "one", baseVersion: null }))
    const reverted = await json(await send("POST", `/books/${label}/reader-source/revert`, { path: DOCK, baseVersion: saved.body.version }))
    const file = await json(await app.request(`/books/${label}/reader-source/file?path=${encodeURIComponent(DOCK)}`))
    expect(file.body.layer).toBe("base")

    await send("POST", `/books/${label}/reader-source/restore`, { path: DOCK, version: saved.body.version, baseVersion: reverted.body.version })
    const history = await json(await app.request(`/books/${label}/reader-source/history?path=${encodeURIComponent(DOCK)}`))
    expect(history.body.versions.map((entry: { deleted: boolean }) => entry.deleted)).toEqual([false, true, false])
  })

  it("AC-17: an override made from an older base is outdated", async () => {
    const storage = createBookStorage(label, booksDir)
    try {
      storage.putNodeData(READER_SOURCE_MODE_NODE, "book", { followsGlobal: false })
      storage.putNodeData(READER_SOURCE_NODE, DOCK, { content: "old", baseHash: "stale-hash" })
    } finally {
      storage.close()
    }
    const tree = await json(await app.request(`/books/${label}/reader-source/tree`))
    expect(tree.body.files).toContainEqual({ path: DOCK, layer: "book", version: 1, outdated: true })
  })

  it("AC-18: any src path is writable; paths outside src are rejected", async () => {
    const created = await send("PUT", `/books/${label}/reader-source/file`, { path: "app/new-helper.ts", content: "export const x = 1", baseVersion: null })
    expect(created.status).toBe(200)

    for (const bad of ["../package.json", "/etc/passwd", "features/../../x.ts", "build-options.mjs", "a\\b.ts"]) {
      const response = await send("PUT", `/books/${label}/reader-source/file`, { path: bad, content: "x", baseVersion: null })
      expect(response.status, bad).toBe(400)
    }
    expect((await app.request(`/books/${label}/reader-source/file?path=..%2Fpackage.json`)).status).toBe(400)
  })

  it("AC-20: a global save reaches a following book until it is customized", async () => {
    await send("PUT", "/reader-source/global/file", { path: DOCK, content: "global", baseVersion: null })
    const following = await json(await app.request(`/books/${label}/reader-source/file?path=${encodeURIComponent(DOCK)}`))
    expect(following.body).toMatchObject({ layer: "global", content: "global" })

    await send("PUT", `/books/${label}/reader-source/file`, { path: "styles/globals.css", content: "book", baseVersion: null })
    await send("PUT", "/reader-source/global/file", { path: DOCK, content: "global v2", baseVersion: 1 })
    const customized = await json(await app.request(`/books/${label}/reader-source/file?path=${encodeURIComponent(DOCK)}`))
    expect(customized.body).toMatchObject({ layer: "book", content: "global" })

    await send("POST", `/books/${label}/reader-source/follow-global`, {})
    const again = await json(await app.request(`/books/${label}/reader-source/file?path=${encodeURIComponent(DOCK)}`))
    expect(again.body).toMatchObject({ layer: "global", content: "global v2" })
  })

  it("AC-21: a global reset keeps its history", async () => {
    await send("PUT", "/reader-source/global/file", { path: DOCK, content: "global", baseVersion: null })
    await send("POST", "/reader-source/global/revert", { path: DOCK, baseVersion: 1 })
    const history = await json(await app.request(`/reader-source/global/history?path=${encodeURIComponent(DOCK)}`))
    expect(history.body.versions).toHaveLength(2)
    expect((await json(await app.request(`/reader-source/global/file?path=${encodeURIComponent(DOCK)}`))).body.layer).toBe("base")
  })
})

describe("reader source invariants", () => {
  it("AC-19: reader-source is never in a clear list or a clear call", () => {
    const nodes = [READER_SOURCE_NODE, READER_SOURCE_MODE_NODE]
    for (const from of STAGE_ORDER) {
      for (const to of STAGE_ORDER) {
        const cleared = getStageRerunClearNodes(from, to) as string[]
        for (const node of nodes) expect(cleared).not.toContain(node)
      }
    }
    for (const node of nodes) expect(IMAGE_SET_CHANGE_CLEAR_NODE_TYPES as readonly string[]).not.toContain(node)

    const sources = (dir: string): string[] =>
      fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) return sources(full)
        return entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts") ? [full] : []
      })
    for (const file of [...sources(path.join(repoRoot, "apps/api/src")), ...sources(path.join(repoRoot, "packages/pipeline/src"))]) {
      const text = fs.readFileSync(file, "utf8")
      for (const match of text.matchAll(/clearNodesByType\(([^)]*)\)/g)) {
        expect(match[1], file).not.toMatch(/reader-source|READER_SOURCE/)
      }
    }
  })
})
