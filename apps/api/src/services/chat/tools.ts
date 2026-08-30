import { createChatToolRegistry, type ChatToolRegistry } from "@adt/chat"
import type { ChatToolContext } from "./context.js"

/**
 * The concrete tool set, bound to the api's services. Read tools execute
 * freely; mutating tools stream without an executor and run only after the
 * user approves the call.
 */
export function createBookChatTools(): ChatToolRegistry<ChatToolContext> {
  return createChatToolRegistry<ChatToolContext>()
}
