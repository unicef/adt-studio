import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { z } from "zod"
import { createBookStorage } from "@adt/storage"
import {
  createProviderRegistry,
  toJsonSchema,
  type AgentTurnRequest,
  type AgentTurnResponse,
  type AnyProviderModule,
  type ProviderModule,
} from "@adt/llm"
import { READER_SOURCE_NODE, type ChatScope } from "@adt/types"
import { createReaderSourceService } from "../reader-source-service.js"
import { runChatTurn } from "./chat-service.js"
import { createReaderToolkit } from "./reader-tools.js"
import { createChatThreadStore } from "./thread-store.js"

const webAssetsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../../assets/adt")
const label = "reader-chat-book"
const DOCK = "features/dock/components/DockIconButton.tsx"

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

const call = (toolName: string, args: unknown): AgentTurnResponse => ({
  text: "",
  toolCalls: [{ id: `call-${toolName}`, toolName, args }],
  finishReason: "tool-calls",
  usage: { inputTokens: 1, outputTokens: 1 },
})
const text = (value: string): AgentTurnResponse => ({ text: value, toolCalls: [], finishReason: "stop", usage: { inputTokens: 1, outputTokens: 1 } })

describe("reader chat tools", () => {
  let booksDir: string

  beforeEach(() => {
    booksDir = fs.mkdtempSync(path.join(os.tmpdir(), "adt-reader-chat-"))
    createBookStorage(label, booksDir).close()
    fs.writeFileSync(path.join(booksDir, label, "config.yaml"), "agents:\n  model: fake:fake-1\n")
  })

  afterEach(() => {
    fs.rmSync(booksDir, { recursive: true, force: true })
  })

  function turn(threadId: string, input: { text: string } | { decisions: Record<string, boolean> }, responses: AgentTurnResponse[], scope: ChatScope = "reader") {
    const { registry, requests } = fakeRegistry(responses)
    const result = runChatTurn({
      label,
      booksDir,
      promptsDir: path.join(booksDir, "prompts"),
      threadId,
      input,
      scope,
      webAssetsDir,
      credentials: {},
      registry,
      onMessage: () => {},
    })
    return { result, requests }
  }

  const versions = () => {
    const storage = createBookStorage(label, booksDir)
    try {
      return storage.getAllNodeVersions(READER_SOURCE_NODE, DOCK).length
    } finally {
      storage.close()
    }
  }

  it("AC-22: a reader write waits for approval and an approved one saves exactly one version", async () => {
    const { id } = createChatThreadStore(booksDir, label).create()
    const paused = await turn(id, { text: "Make the dock buttons rounder" }, [call("writeReaderFile", { path: DOCK, content: "export const x = 1\n" })]).result
    expect(paused.pendingToolCalls.map((pending) => pending.toolName)).toEqual(["writeReaderFile"])
    expect(versions()).toBe(0)

    await turn(id, { decisions: { "call-writeReaderFile": true } }, [text("Done.")]).result
    expect(versions()).toBe(1)
  })

  it("AC-23: compileReader returns the compile route's errors, and paths outside src are refused", async () => {
    const toolkit = createReaderToolkit(label, booksDir, webAssetsDir)
    const drafts = { [DOCK]: 'import "left-pad"\n' }
    const fromTool = await toolkit.tools.compileReader.execute({ drafts: [{ path: DOCK, content: drafts[DOCK] }] })
    const fromService = await createReaderSourceService(booksDir, webAssetsDir).compile(label, drafts)
    expect(fromTool).toEqual(fromService)
    expect(fromTool.ok).toBe(false)

    const { id } = createChatThreadStore(booksDir, label).create()
    const result = await turn(id, { text: "Read the package file" }, [call("readReaderFile", { path: "../package.json" }), text("I cannot.")]).result
    const toolMessage = result.messages.find((message) => message.role === "tool")
    expect(toolMessage).toMatchObject({ results: [{ toolName: "readReaderFile", isError: true }] })
  }, 60_000)

  it("declares every parameter as required, as strict tool schemas demand", () => {
    const toolkit = createReaderToolkit(label, booksDir, webAssetsDir)
    const objectsMissingRequired = (schema: unknown, at: string): string[] => {
      if (!schema || typeof schema !== "object") return []
      const node = schema as { type?: unknown; properties?: Record<string, unknown>; required?: string[]; additionalProperties?: unknown; items?: unknown; anyOf?: unknown[] }
      const own = node.properties
        ? Object.keys(node.properties)
            .filter((key) => !(node.required ?? []).includes(key))
            .map((key) => `${at}.${key}`)
        : []
      const open = node.type === "object" && node.additionalProperties !== false ? [`${at} allows additional properties`] : []
      const nested = [
        ...Object.entries(node.properties ?? {}).flatMap(([key, child]) => objectsMissingRequired(child, `${at}.${key}`)),
        ...objectsMissingRequired(node.items, `${at}[]`),
        ...(node.anyOf ?? []).flatMap((child) => objectsMissingRequired(child, at)),
      ]
      return [...own, ...open, ...nested]
    }
    const problems = Object.entries(toolkit.tools).flatMap(([name, tool]) =>
      objectsMissingRequired(toJsonSchema(tool.parameters, name), name),
    )
    expect(problems).toEqual([])
  })

  it("AC-25: reader tools only exist in reader scope", async () => {
    const { id } = createChatThreadStore(booksDir, label).create()
    const book = turn(id, { text: "hi" }, [text("hello")], "book")
    await book.result
    expect(book.requests[0]?.tools.map((tool) => tool.name)).not.toContain("writeReaderFile")

    const { id: readerThread } = createChatThreadStore(booksDir, label).create()
    const reader = turn(readerThread, { text: "hi" }, [text("hello")], "reader")
    await reader.result
    expect(reader.requests[0]?.tools.map((tool) => tool.name)).toEqual(expect.arrayContaining(["listReaderFiles", "writeReaderFile", "compileReader"]))
    expect(reader.requests[0]?.system).toContain("Reader customization")
  })
})
