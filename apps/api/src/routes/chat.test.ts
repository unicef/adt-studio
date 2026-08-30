import { afterEach, beforeEach, describe, expect, it } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { Hono } from "hono"
import { createBookStorage } from "@adt/storage"
import { CHAT_ID_FILENAME } from "@adt/chat"
import { errorHandler } from "../middleware/error-handler.js"
import { createChatRoutes } from "./chat.js"
import type { StageService } from "../services/stage-service.js"
import type { TaskService } from "../services/task-service.js"

let tmpDir: string
let chatsDir: string

const LABEL = "sample-book"

const stageService = {
  getStatus: () => ({}) as never,
  getQueuedStages: () => [],
  startStageRun: () => ({ status: "started" as const, id: "run-1" }),
  cancelStageRun: () => null,
} satisfies StageService

const taskService = {} as TaskService

function buildApp() {
  const app = new Hono()
  app.onError(errorHandler)
  app.route(
    "/",
    createChatRoutes(
      {
        booksDir: tmpDir,
        promptsDir: path.join(tmpDir, "prompts"),
        webAssetsDir: path.join(tmpDir, "assets"),
        configPath: path.join(tmpDir, "config.yaml"),
      },
      stageService,
      taskService,
    ),
  )
  return app
}

function seedBook(label: string): void {
  createBookStorage(label, tmpDir).close()
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "adt-chat-route-"))
  chatsDir = path.join(tmpDir, "chats-store")
  process.env.CHATS_DIR = chatsDir
  seedBook(LABEL)
})

afterEach(() => {
  delete process.env.CHATS_DIR
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

async function createThread(app: Hono, label = LABEL) {
  const res = await app.request(`/books/${label}/chat/threads`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  })
  expect(res.status).toBe(201)
  return (await res.json()) as { threadId: string; model: string }
}

describe("chat thread routes", () => {
  it("404s for a book that does not exist", async () => {
    const res = await buildApp().request("/books/ghost/chat/threads")
    expect(res.status).toBe(404)
  })

  it("writes the chat id into the book directory on first use", async () => {
    const app = buildApp()
    await app.request(`/books/${LABEL}/chat/threads`)
    const idFile = path.join(tmpDir, LABEL, CHAT_ID_FILENAME)
    expect(fs.existsSync(idFile)).toBe(true)
    expect(fs.readFileSync(idFile, "utf8").trim()).toMatch(/^[0-9a-f-]{36}$/)
  })

  it("keeps the chat store outside the book directory", async () => {
    const app = buildApp()
    await createThread(app)
    expect(fs.existsSync(chatsDir)).toBe(true)
    expect(fs.readdirSync(path.join(tmpDir, LABEL)).some((f) => f.endsWith(".json"))).toBe(false)
  })

  it("creates, lists, renames and deletes a thread", async () => {
    const app = buildApp()
    const created = await createThread(app)

    const listed = await (await app.request(`/books/${LABEL}/chat/threads`)).json()
    expect(listed.threads).toHaveLength(1)

    const patched = await app.request(`/books/${LABEL}/chat/threads/${created.threadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Glossary work", model: "anthropic:claude-opus-4" }),
    })
    expect(await patched.json()).toMatchObject({
      title: "Glossary work",
      model: "anthropic:claude-opus-4",
    })

    const deleted = await app.request(`/books/${LABEL}/chat/threads/${created.threadId}`, {
      method: "DELETE",
    })
    expect(deleted.status).toBe(204)
    expect(
      ((await (await app.request(`/books/${LABEL}/chat/threads`)).json()) as { threads: [] })
        .threads,
    ).toHaveLength(0)
  })

  it("404s when renaming a thread that does not exist", async () => {
    const res = await buildApp().request(`/books/${LABEL}/chat/threads/missing`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "x" }),
    })
    expect(res.status).toBe(404)
  })

  it("reports no in-flight turn to cancel", async () => {
    const app = buildApp()
    const created = await createThread(app)
    const res = await app.request(
      `/books/${LABEL}/chat/threads/${created.threadId}/cancel`,
      { method: "POST" },
    )
    expect(await res.json()).toEqual({ cancelled: false })
  })
})

describe("chat model listing", () => {
  it("offers only models whose provider has a key on the request", async () => {
    const app = buildApp()
    const res = await app.request(`/books/${LABEL}/chat/models`, {
      headers: { "X-Anthropic-API-Key": "sk-ant-test" },
    })
    const body = (await res.json()) as { models: Array<{ provider: string }> }
    expect(body.models.length).toBeGreaterThan(0)
    expect(body.models.every((m) => m.provider === "anthropic")).toBe(true)
  })

  it("offers nothing when no key is present", async () => {
    const res = await buildApp().request(`/books/${LABEL}/chat/models`)
    expect(await res.json()).toEqual({ models: [] })
  })
})

describe("chat message endpoint", () => {
  const userMessage = {
    id: "m1",
    role: "user" as const,
    parts: [{ type: "text", text: "What is on page 3 of this book?" }],
  }

  async function send(app: Hono, threadId: string, body: unknown, headers: Record<string, string> = {}) {
    return app.request(`/books/${LABEL}/chat/threads/${threadId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    })
  }

  it("rejects a body with no messages", async () => {
    const app = buildApp()
    const created = await createThread(app)
    expect((await send(app, created.threadId, { messages: [] })).status).toBe(400)
  })

  it("400s with a pointer to settings when the model has no key", async () => {
    const app = buildApp()
    const created = await createThread(app)
    const res = await send(app, created.threadId, {
      messages: [userMessage],
      model: "openai:gpt-5.4",
    })
    expect(res.status).toBe(400)
    expect(await res.text()).toMatch(/Providers/)
  })

  it("persists the user message and derives a title before calling the provider", async () => {
    const app = buildApp()
    const created = await createThread(app)
    await send(app, created.threadId, { messages: [userMessage], model: "openai:gpt-5.4" })

    const thread = await (
      await app.request(`/books/${LABEL}/chat/threads/${created.threadId}`)
    ).json()
    expect(thread.messages).toHaveLength(1)
    expect(thread.title).toBe("What is on page 3 of this book?")
    expect(thread.model).toBe("openai:gpt-5.4")
  })

  it("404s for an unknown thread", async () => {
    const res = await send(buildApp(), "missing", { messages: [userMessage] })
    expect(res.status).toBe(404)
  })
})
