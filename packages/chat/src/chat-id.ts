import fs from "node:fs"
import path from "node:path"
import { randomUUID } from "node:crypto"

export const CHAT_ID_FILENAME = "chat-id"

const CHAT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/

/**
 * Books have no stable identifier beyond their directory name, so the chat
 * store is keyed by a UUID written into the book directory on first use. It
 * survives renames of the book directory.
 */
export function resolveChatId(bookDir: string): string {
  const filePath = path.join(bookDir, CHAT_ID_FILENAME)
  if (fs.existsSync(filePath)) {
    const existing = fs.readFileSync(filePath, "utf8").trim()
    if (CHAT_ID_PATTERN.test(existing)) return existing
  }
  const chatId = randomUUID()
  fs.mkdirSync(bookDir, { recursive: true })
  fs.writeFileSync(filePath, `${chatId}\n`, "utf8")
  return chatId
}

/** Writable chat store root, mirroring the STYLEGUIDES_DIR override pattern. */
export function getChatsDir(booksDir: string): string {
  return path.resolve(process.env.CHATS_DIR ?? path.join(path.resolve(booksDir), ".chats"))
}
