import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { z } from "zod"
import { createBookStorage } from "@adt/storage"
import {
  createProviderRegistry,
  type AgentTurnRequest,
  type AgentTurnResponse,
  type AnyProviderModule,
  type ProviderModule,
} from "@adt/llm"
import type { ChatMessage } from "@adt/types"
import { ChatStateError, runChatTurn } from "./chat-service.js"
import { createChatThreadStore } from "./thread-store.js"

const label = "chat-book"

function fakeRegistry(responses: AgentTurnResponse[]) {
  const requests: AgentTurnRequest[] = []
  const module: ProviderModule<{ apiKey?: string }> = {
    manifest: {
      id: "fake",
      displayName: "Fake",
      modalities: ["agent"],
      credentialFields: [],
      capabilities: { agent: { tools: true, streaming: false } },
      defaultModels: { agent: "fake-1" },
    },
    credentialSchema: z.object({ apiKey: z.string().optional() }),
    cacheFingerprint: () => ({ adapterVersion: "fake-1" }),
    createAgentBackend: () => ({
      generateTurn: async (request) => {
        requests.push({ ...request, messages: structuredClone(request.messages) })
        const response = responses.shift()
        if (!response) throw new Error("no response configured")
        return response
      },
    }),
  }
  return { registry: createProviderRegistry().register(module as AnyProviderModule).freeze(), requests }
}

function text(value: string): AgentTurnResponse {
  return { text: value, toolCalls: [], finishReason: "stop", usage: { inputTokens: 1, outputTokens: 1 } }
}

function call(toolName: string, args: unknown): AgentTurnResponse {
  return {
    text: "",
    toolCalls: [{ id: `call-${toolName}`, toolName, args }],
    finishReason: "tool-calls",
    usage: { inputTokens: 1, outputTokens: 1 },
  }
}

describe("runChatTurn", () => {
  let booksDir: string

  beforeEach(() => {
    booksDir = fs.mkdtempSync(path.join(os.tmpdir(), "adt-chat-"))
    createBookStorage(label, booksDir).close()
    fs.writeFileSync(path.join(booksDir, label, "config.yaml"), "agents:\n  model: fake:fake-1\n")
  })

  afterEach(() => {
    fs.rmSync(booksDir, { recursive: true, force: true })
  })

  function run(threadId: string, input: { text: string } | { decisions: Record<string, boolean> }, responses: AgentTurnResponse[]) {
    const { registry, requests } = fakeRegistry(responses)
    const streamed: ChatMessage[] = []
    const result = runChatTurn({
      label,
      booksDir,
      promptsDir: path.join(booksDir, "prompts"),
      threadId,
      input,
      credentials: {},
      registry,
      onMessage: (message) => streamed.push(message),
    })
    return { result, streamed, requests }
  }

  it("answers, streams the reply and persists the conversation with a title", async () => {
    const store = createChatThreadStore(booksDir, label)
    const { id } = store.create()

    const { result, streamed } = run(id, { text: "What is this book about?" }, [text("It is about rivers.")])
    const thread = await result

    expect(streamed).toEqual([{ role: "assistant", text: "It is about rivers.", toolCalls: [] }])
    expect(thread.title).toBe("What is this book about?")
    expect(store.read(id).messages).toEqual([
      { role: "user", content: "What is this book about?" },
      { role: "assistant", text: "It is about rivers.", toolCalls: [] },
    ])
  })

  it("runs read tools without asking", async () => {
    const { id } = createChatThreadStore(booksDir, label).create()

    const thread = await run(id, { text: "List the pages" }, [call("listPages", {}), text("There are no pages.")]).result

    expect(thread.pendingToolCalls).toEqual([])
    expect(thread.messages.map((message) => message.role)).toEqual(["user", "assistant", "tool", "assistant"])
  })

  it("stops for approval before a write and resumes after the user declines", async () => {
    const store = createChatThreadStore(booksDir, label)
    const { id } = store.create()
    const write = call("updateSection", { pageId: "pg001", sectionIndex: 0, html: "<section></section>" })

    const paused = await run(id, { text: "Rewrite the first section" }, [write]).result
    expect(paused.pendingToolCalls).toEqual(write.toolCalls)

    await expect(run(id, { text: "Another question" }, []).result).rejects.toBeInstanceOf(ChatStateError)

    const { result, requests } = run(id, { decisions: { "call-updateSection": false } }, [text("Understood.")])
    const resumed = await result

    expect(resumed.pendingToolCalls).toEqual([])
    const toolMessage = resumed.messages.find((message) => message.role === "tool")
    expect(toolMessage).toMatchObject({ results: [{ id: "call-updateSection", isError: true }] })
    expect(requests[0]?.messages.at(-1)).toMatchObject({ role: "tool" })
    expect(resumed.messages.at(-1)).toEqual({ role: "assistant", text: "Understood.", toolCalls: [] })
  })

  it("executes an approved write and feeds its result back to the model", async () => {
    const { id } = createChatThreadStore(booksDir, label).create()
    const write = call("updateSection", { pageId: "missing", sectionIndex: 0, html: "<section></section>" })
    await run(id, { text: "Rewrite it" }, [write]).result

    const resumed = await run(id, { decisions: { "call-updateSection": true } }, [text("Done.")]).result

    const toolMessage = resumed.messages.find((message) => message.role === "tool")
    expect(toolMessage).toMatchObject({ results: [{ id: "call-updateSection", result: { ok: false } }] })
  })

  it("refuses an approval when nothing is pending", async () => {
    const { id } = createChatThreadStore(booksDir, label).create()

    await expect(run(id, { decisions: {} }, []).result).rejects.toBeInstanceOf(ChatStateError)
  })
})

describe("chat thread store", () => {
  it("lists threads newest first and ignores foreign files", async () => {
    const booksDir = fs.mkdtempSync(path.join(os.tmpdir(), "adt-chat-store-"))
    try {
      const store = createChatThreadStore(booksDir, label)
      const first = store.create()
      await new Promise((resolve) => setTimeout(resolve, 5))
      const second = store.create()
      fs.writeFileSync(path.join(booksDir, ".chats", label, "notes.json"), "{}")

      expect(store.list().map((thread) => thread.id)).toEqual([second.id, first.id])
      expect(() => store.read("../escape")).toThrow(/not found/)
    } finally {
      fs.rmSync(booksDir, { recursive: true, force: true })
    }
  })
})
