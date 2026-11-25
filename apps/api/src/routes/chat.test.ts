import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { Hono } from "hono"
import { createBookStorage } from "@adt/storage"
import { errorHandler } from "../middleware/error-handler.js"
import { createChatRoutes } from "./chat.js"

const label = "chat-route-book"

describe("chat routes", () => {
  let booksDir: string
  let app: Hono

  beforeEach(() => {
    booksDir = fs.mkdtempSync(path.join(os.tmpdir(), "adt-chat-route-"))
    createBookStorage(label, booksDir).close()
    app = new Hono().onError(errorHandler).route("/", createChatRoutes(booksDir, path.join(booksDir, "prompts")))
  })

  afterEach(() => {
    fs.rmSync(booksDir, { recursive: true, force: true })
  })

  const post = (url: string, body: unknown) =>
    app.request(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })

  it("creates, lists, reads and deletes threads", async () => {
    const created = await (await app.request(`/books/${label}/chat/threads`, { method: "POST" })).json()
    const listed = await (await app.request(`/books/${label}/chat/threads`)).json()
    expect(listed.threads.map((thread: { id: string }) => thread.id)).toEqual([created.id])

    expect((await app.request(`/books/${label}/chat/threads/${created.id}`)).status).toBe(200)
    expect((await app.request(`/books/${label}/chat/threads/${created.id}`, { method: "DELETE" })).status).toBe(200)
    expect((await app.request(`/books/${label}/chat/threads/${created.id}`)).status).toBe(404)
  })

  it("rejects unknown books, unknown threads, empty messages and approvals with nothing pending", async () => {
    const { id } = await (await app.request(`/books/${label}/chat/threads`, { method: "POST" })).json()

    expect((await app.request("/books/missing-book/chat/threads")).status).toBe(404)
    expect((await post(`/books/${label}/chat/threads/00000000-0000-4000-8000-000000000000/messages`, { text: "hi" })).status).toBe(404)
    expect((await post(`/books/${label}/chat/threads/${id}/messages`, { text: "   " })).status).toBe(400)
    expect((await post(`/books/${label}/chat/threads/${id}/approval`, { decisions: {} })).status).toBe(409)
  })
})
