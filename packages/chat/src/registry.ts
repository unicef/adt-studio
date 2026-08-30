import type { AnyChatTool, ChatTool } from "./types.js"

export interface ChatToolRegistry<Ctx> {
  register<Input>(tool: ChatTool<Ctx, Input>): void
  get(name: string): AnyChatTool<Ctx> | undefined
  list(): AnyChatTool<Ctx>[]
  names(): string[]
}

/**
 * Plain name → tool map. Kept free of transport concerns so an MCP server can
 * wrap the very same registry without touching the tool definitions.
 */
export function createChatToolRegistry<Ctx>(
  tools: ChatTool<Ctx, never>[] = [],
): ChatToolRegistry<Ctx> {
  const map = new Map<string, AnyChatTool<Ctx>>()

  const registry: ChatToolRegistry<Ctx> = {
    register<Input>(tool: ChatTool<Ctx, Input>): void {
      if (map.has(tool.name)) {
        throw new Error(`Chat tool already registered: ${tool.name}`)
      }
      map.set(tool.name, tool as unknown as AnyChatTool<Ctx>)
    },
    get(name) {
      return map.get(name)
    },
    list() {
      return [...map.values()]
    },
    names() {
      return [...map.keys()]
    },
  }

  for (const tool of tools) registry.register(tool)
  return registry
}

/** Type-preserving helper so tool input types are inferred from the schema. */
export function defineChatTool<Ctx, Input>(
  tool: ChatTool<Ctx, Input>,
): ChatTool<Ctx, never> {
  return tool as unknown as ChatTool<Ctx, never>
}
