import path from "node:path"
import { createBookStorage, withBookWriter } from "@adt/storage"
import { createBookTools, type AgentCredentials } from "@adt/agents"
import { executeToolCall, runAgentLoop, type AgentToolSet, type ProviderRegistry } from "@adt/llm"
import type { ChatMessage, ChatThread, ChatToolResult } from "@adt/types"
import { requireExistingBook } from "../../utils/book-exists.js"
import { resolveAgentModelId, resolveStyleguide } from "../agents-service.js"
import { createChatThreadStore } from "./thread-store.js"

export const BOOK_WRITE_TOOLS: ReadonlySet<string> = new Set([
  "updateSection",
  "createTemplatedActivity",
  "createCustomSection",
])

const MAX_CHAT_STEPS = 12
const CHAT_TIMEOUT_MS = 10 * 60_000
const DECLINED = "The user declined this action. Do not retry it unless they ask again."

export class ChatStateError extends Error {}

export interface ChatToolkit {
  tools: AgentToolSet
  requiresApproval: ReadonlySet<string>
  instructions?: string
}

export type ChatTurnInput = { text: string } | { decisions: Record<string, boolean> }

export interface RunChatTurnOptions {
  label: string
  booksDir: string
  promptsDir: string
  configPath?: string
  threadId: string
  input: ChatTurnInput
  credentials: AgentCredentials
  onMessage: (message: ChatMessage) => void
  signal?: AbortSignal
  registry?: ProviderRegistry
}

const runningThreads = new Set<string>()

function systemPrompt(bookTitle: string, toolkit: ChatToolkit): string {
  return [
    `You are the ADT Studio assistant for the book "${bookTitle}". ADT Studio turns textbooks into accessible digital books.`,
    "Use the tools to read the book before answering questions about it. Never invent page ids or content.",
    "Tools that change the book wait for the user's approval. Propose one focused change at a time and explain it in one or two sentences before calling the tool.",
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
    const toolkit: ChatToolkit = { tools: book.tools, requiresApproval: BOOK_WRITE_TOOLS }
    const needsApproval = (toolName: string) => toolkit.requiresApproval.has(toolName)

    let prompt: string | undefined
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
      prompt = input.text
    }

    const metadata = storage.getLatestNodeData("metadata", "book")?.data as { title?: string | null } | undefined
    const result = await runAgentLoop({
      modelId: resolveAgentModelId(label, booksDir, options.configPath),
      system: systemPrompt(metadata?.title ?? label, toolkit),
      messages: thread.messages,
      prompt,
      tools: toolkit.tools,
      requiresApproval: (call) => needsApproval(call.toolName),
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
      title: thread.title || (prompt ?? "").slice(0, 60),
      messages: result.messages,
      pendingToolCalls: result.pendingToolCalls ?? [],
    })
  } finally {
    storage.close()
  }
}
