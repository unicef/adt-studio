import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { CHAT_THREAD_FORMAT_VERSION } from "../types.js"
import { ChatThreadConflictError, ChatThreadNotFoundError, createChatStore } from "../store.js"

let chatsDir: string

beforeEach(() => {
  chatsDir = fs.mkdtempSync(path.join(os.tmpdir(), "adt-chat-store-"))
})

afterEach(() => {
  fs.rmSync(chatsDir, { recursive: true, force: true })
})

const CHAT_ID = "book-chat-1"

describe("chat thread store", () => {
  it("round-trips a thread with its messages", () => {
    const store = createChatStore(chatsDir)
    const created = store.createThread(CHAT_ID, { model: "openai:gpt-5.4", title: "Hello" })

    store.saveThread({
      ...created,
      messages: [{ id: "m1", role: "user", parts: [{ type: "text", text: "hi" }] }],
    })

    const loaded = store.requireThread(CHAT_ID, created.threadId)
    expect(loaded.formatVersion).toBe(CHAT_THREAD_FORMAT_VERSION)
    expect(loaded.model).toBe("openai:gpt-5.4")
    expect(loaded.messages).toHaveLength(1)
    expect(loaded.messages[0].parts[0]).toEqual({ type: "text", text: "hi" })
  })

  it("lists threads newest-updated first", () => {
    const store = createChatStore(chatsDir)
    const older = store.createThread(CHAT_ID, { model: "m", title: "older" })
    const newer = store.createThread(CHAT_ID, { model: "m", title: "newer" })
    fs.writeFileSync(
      path.join(chatsDir, CHAT_ID, `${older.threadId}.json`),
      JSON.stringify({ ...older, updatedAt: "2020-01-01T00:00:00.000Z" }),
      "utf8",
    )

    const summaries = store.listThreads(CHAT_ID)
    expect(summaries.map((t) => t.threadId)).toEqual([newer.threadId, older.threadId])
  })

  it("rejects a write whose base version is stale", () => {
    const store = createChatStore(chatsDir)
    const created = store.createThread(CHAT_ID, { model: "m" })
    const saved = store.saveThread({ ...created, title: "first" })

    expect(() =>
      store.saveThread({ ...created, title: "second" }, { expectedUpdatedAt: created.updatedAt }),
    ).toThrow(ChatThreadConflictError)

    expect(
      store.saveThread({ ...saved, title: "second" }, { expectedUpdatedAt: saved.updatedAt }).title,
    ).toBe("second")
  })

  it("persists executed tool call ids", () => {
    const store = createChatStore(chatsDir)
    const created = store.createThread(CHAT_ID, { model: "m" })
    store.saveThread({ ...created, executedToolCallIds: ["call-a", "call-b"] })

    expect(store.requireThread(CHAT_ID, created.threadId).executedToolCallIds).toEqual([
      "call-a",
      "call-b",
    ])
  })

  it("throws for an unknown thread and returns undefined from the soft getter", () => {
    const store = createChatStore(chatsDir)
    expect(store.getThread(CHAT_ID, "missing")).toBeUndefined()
    expect(() => store.requireThread(CHAT_ID, "missing")).toThrow(ChatThreadNotFoundError)
  })

  it("deletes a thread and reports whether it existed", () => {
    const store = createChatStore(chatsDir)
    const created = store.createThread(CHAT_ID, { model: "m" })
    expect(store.deleteThread(CHAT_ID, created.threadId)).toBe(true)
    expect(store.deleteThread(CHAT_ID, created.threadId)).toBe(false)
  })

  it("refuses ids that would escape the store directory", () => {
    const store = createChatStore(chatsDir)
    expect(() => store.getThread("../../etc", "x")).toThrow(/Invalid chat/)
    expect(() => store.getThread(CHAT_ID, "../secret")).toThrow(/Invalid chat/)
  })

  it("gives messages stored without an id one on read", () => {
    const store = createChatStore(chatsDir)
    const created = store.createThread(CHAT_ID, { model: "m" })
    fs.writeFileSync(
      path.join(chatsDir, CHAT_ID, `${created.threadId}.json`),
      JSON.stringify({
        ...created,
        messages: [
          { id: "m1", role: "user", parts: [{ type: "text", text: "hi" }] },
          { id: "", role: "assistant", parts: [{ type: "text", text: "hello" }] },
        ],
      }),
      "utf8",
    )

    const loaded = store.requireThread(CHAT_ID, created.threadId)
    expect(loaded.messages.map((message) => message.id)).toEqual(["m1", "restored-1"])
  })

  it("skips unreadable thread files instead of failing the listing", () => {
    const store = createChatStore(chatsDir)
    const created = store.createThread(CHAT_ID, { model: "m", title: "good" })
    fs.writeFileSync(path.join(chatsDir, CHAT_ID, "broken.json"), "{not json", "utf8")

    expect(store.listThreads(CHAT_ID).map((t) => t.threadId)).toEqual([created.threadId])
  })
})
