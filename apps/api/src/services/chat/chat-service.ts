import path from "node:path"
import { createBookStorage, withBookWriter } from "@adt/storage"
import { createBookTools, type AgentCredentials } from "@adt/agents"
import { executeToolCall, runAgentLoop, type AgentToolSet, type ProviderRegistry } from "@adt/llm"
import type { ChatMessage, ChatMode, ChatScope, ChatThread, ChatToolResult } from "@adt/types"
import { requireExistingBook } from "../../utils/book-exists.js"
import { resolveAgentModelId, resolveStyleguide } from "../agents-service.js"
import { createChatThreadStore } from "./thread-store.js"
import { createReaderToolkit } from "./reader-tools.js"

export const BOOK_WRITE_TOOLS: ReadonlySet<string> = new Set([
  "updateSection",
  "createTemplatedActivity",
  "createCustomSection",
])

export const BOOK_EDIT_TOOLS: ReadonlySet<string> = new Set(["updateSection"])

const MODE_INSTRUCTIONS: Record<ChatMode, string> = {
  manual:
    "Tools that change the book wait for the user's approval. Propose one focused change at a time and explain it in one or two sentences before calling the tool.",
  acceptEdits:
    "Edits to existing content run right away; other changes wait for the user's approval. Explain each change in one or two sentences before calling the tool.",
  auto: "Changes run right away without asking. Keep each change focused on what the user asked and explain it in one or two sentences before calling the tool.",
  plan: "Plan mode is on: you cannot change anything. Read what you need, then reply with a short numbered plan of the changes you would make. The user will switch modes to apply it.",
}

const MAX_CHAT_STEPS = 12
const CHAT_TIMEOUT_MS = 10 * 60_000
const DECLINED = "The user declined this action. Do not retry it unless they ask again."

export class ChatStateError extends Error {}

export interface ChatToolkit {
  tools: AgentToolSet
  requiresApproval: ReadonlySet<string>
  editTools?: ReadonlySet<string>
  instructions?: string
}

export type ChatTurnInput = { text: string; images?: string[] } | { decisions: Record<string, boolean> }

export interface RunChatTurnOptions {
  label: string
  booksDir: string
  promptsDir: string
  configPath?: string
  threadId: string
  input: ChatTurnInput
  mode?: ChatMode
  scope?: ChatScope
  webAssetsDir?: string
  credentials: AgentCredentials
  onMessage: (message: ChatMessage) => void
  signal?: AbortSignal
  registry?: ProviderRegistry
}

const runningThreads = new Set<string>()

function mergeToolkits(toolkits: ChatToolkit[]): ChatToolkit {
  return {
    tools: Object.assign({}, ...toolkits.map((toolkit) => toolkit.tools)),
    requiresApproval: new Set(toolkits.flatMap((toolkit) => [...toolkit.requiresApproval])),
    editTools: new Set(toolkits.flatMap((toolkit) => [...(toolkit.editTools ?? [])])),
    instructions: toolkits.map((toolkit) => toolkit.instructions ?? "").filter(Boolean).join("\n\n"),
  }
}

function applyMode(toolkit: ChatToolkit, mode: ChatMode, bookDir: string) {
  const isWrite = (name: string) => toolkit.requiresApproval.has(name)
  const asks = (name: string) =>
    isWrite(name) && (mode === "manual" || (mode === "acceptEdits" && !toolkit.editTools?.has(name)))
  const tools: AgentToolSet = {}
  for (const [name, tool] of Object.entries(toolkit.tools)) {
    if (!isWrite(name) || asks(name)) tools[name] = tool
    else if (mode !== "plan") tools[name] = { ...tool, execute: (args) => withBookWriter(bookDir, async () => tool.execute(args)) }
  }
  return { tools, asks }
}

function systemPrompt(bookTitle: string, toolkit: ChatToolkit, mode: ChatMode): string {
  return [
    `You are the ADT Studio assistant for the book "${bookTitle}". ADT Studio turns textbooks into accessible digital books.`,
    "Use the tools to read the book before answering questions about it. Never invent page ids or content.",
    MODE_INSTRUCTIONS[mode],
    "If the user declines an action, accept it and ask what they would like instead.",
    "Reply in the language the user writes in. Be concise.",
    toolkit.instructions ?? "",
  ]
    .filter(Boolean)
    .join("\n\n")
}

export async function runChatTurn(options: RunChatTurnOptions): Promise<ChatThread> {
  const key = `${options.label}/${options.threadId}`
  if (runningThreads.has(key)) throw new ChatStateError("This conversation is already answering")
  runningThreads.add(key)
  try {
    return await runLocked(options)
  } finally {
    runningThreads.delete(key)
  }
}

async function runLocked(options: RunChatTurnOptions): Promise<ChatThread> {
  const { label, booksDir, input, onMessage } = options
  const bookDir = requireExistingBook(label, booksDir)
  const store = createChatThreadStore(booksDir, label)
  let thread = store.read(options.threadId)
  const storage = createBookStorage(label, booksDir)
  try {
    const book = createBookTools({
      storage,
      bookLabel: label,
      booksDir,
      promptsDir: options.promptsDir,
      configPath: options.configPath,
      styleguide: resolveStyleguide(label, booksDir, options.configPath),
      credentials: options.credentials,
    })
    const toolkits: ChatToolkit[] = [{ tools: book.tools, requiresApproval: BOOK_WRITE_TOOLS, editTools: BOOK_EDIT_TOOLS }]
    if (options.scope === "reader") {
      if (!options.webAssetsDir) throw new ChatStateError("Reader customization is not available here")
      toolkits.push(createReaderToolkit(label, booksDir, options.webAssetsDir))
    }
    const toolkit = mergeToolkits(toolkits)
    const needsApproval = (toolName: string) => toolkit.requiresApproval.has(toolName)
    const mode = options.mode ?? "manual"
    const active = applyMode(toolkit, mode, bookDir)

    let prompt: ChatMessage | undefined
    if ("decisions" in input) {
      if (thread.pendingToolCalls.length === 0) throw new ChatStateError("Nothing is waiting for approval")
      const results: ChatToolResult[] = []
      for (const call of thread.pendingToolCalls) {
        if (!needsApproval(call.toolName)) {
          results.push(await executeToolCall(toolkit.tools, call))
        } else if (input.decisions[call.id] === true) {
          results.push(await withBookWriter(bookDir, () => executeToolCall(toolkit.tools, call)))
        } else {
          results.push({ id: call.id, toolName: call.toolName, result: { error: DECLINED }, isError: true })
        }
      }
      const toolMessage: ChatMessage = { role: "tool", results }
      onMessage(toolMessage)
      thread = store.write({ ...thread, messages: [...thread.messages, toolMessage], pendingToolCalls: [] })
    } else {
      if (thread.pendingToolCalls.length > 0) {
        throw new ChatStateError("Approve or decline the pending action first")
      }
      prompt = input.images?.length
        ? { role: "user", content: input.text, images: input.images }
        : { role: "user", content: input.text }
    }

    const metadata = storage.getLatestNodeData("metadata", "book")?.data as { title?: string | null } | undefined
    const result = await runAgentLoop({
      modelId: resolveAgentModelId(label, booksDir, options.configPath),
      system: systemPrompt(metadata?.title ?? label, toolkit, mode),
      messages: prompt ? [...thread.messages, prompt] : thread.messages,
      tools: active.tools,
      requiresApproval: (call) => active.asks(call.toolName),
      maxSteps: MAX_CHAT_STEPS,
      timeoutMs: CHAT_TIMEOUT_MS,
      signal: options.signal,
      registry: options.registry,
      credentials: options.credentials,
      cacheDir: path.join(bookDir, ".cache"),
      onLog: (entry) => storage.appendLlmLog(entry),
      log: { taskType: "chat", promptName: "book-chat", correlationId: thread.id },
      logLevel: "silent",
      onTurn: (turn) => {
        if (turn.text.trim() || turn.toolCalls.length > 0) {
          onMessage({ role: "assistant", text: turn.text, toolCalls: turn.toolCalls })
        }
        if (turn.toolResults.length > 0) onMessage({ role: "tool", results: turn.toolResults })
      },
    })

    return store.write({
      ...thread,
      title: thread.title || (prompt?.role === "user" ? prompt.content.slice(0, 60) : ""),
      messages: result.messages,
      pendingToolCalls: result.pendingToolCalls ?? [],
    })
  } finally {
    storage.close()
  }
}
