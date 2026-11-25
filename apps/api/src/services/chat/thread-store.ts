import { randomUUID } from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { ChatThread, parseBookLabel, type ChatThreadSummary } from "@adt/types"

const THREAD_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

export class ChatThreadNotFoundError extends Error {
  constructor(id: string) {
    super(`Chat thread ${id} not found`)
  }
}

export function createChatThreadStore(booksDir: string, label: string) {
  const dir = path.join(path.resolve(booksDir), ".chats", parseBookLabel(label))

  function threadPath(id: string): string {
    if (!THREAD_ID.test(id)) throw new ChatThreadNotFoundError(id)
    return path.join(dir, `${id}.json`)
  }

  function read(id: string): ChatThread {
    const file = threadPath(id)
    if (!fs.existsSync(file)) throw new ChatThreadNotFoundError(id)
    return ChatThread.parse(JSON.parse(fs.readFileSync(file, "utf8")))
  }

  function write(thread: ChatThread): ChatThread {
    const file = threadPath(thread.id)
    fs.mkdirSync(dir, { recursive: true })
    const next = { ...thread, updatedAt: new Date().toISOString() }
    const tmp = `${file}.${process.pid}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(next))
    fs.renameSync(tmp, file)
    return next
  }

  function list(): ChatThreadSummary[] {
    if (!fs.existsSync(dir)) return []
    return fs
      .readdirSync(dir)
      .filter((name) => name.endsWith(".json") && THREAD_ID.test(name.slice(0, -5)))
      .flatMap((name) => {
        try {
          const { id, title, createdAt, updatedAt } = read(name.slice(0, -5))
          return [{ id, title, createdAt, updatedAt }]
        } catch {
          return []
        }
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  function create(): ChatThread {
    const now = new Date().toISOString()
    return write({ id: randomUUID(), title: "", createdAt: now, updatedAt: now, messages: [], pendingToolCalls: [] })
  }

  function remove(id: string): void {
    fs.rmSync(threadPath(id), { force: true })
  }

  return { read, write, list, create, remove }
}

export type ChatThreadStore = ReturnType<typeof createChatThreadStore>
